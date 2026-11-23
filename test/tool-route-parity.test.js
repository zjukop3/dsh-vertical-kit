import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { CHECKS, SLUGS } from '../packages/dsh-document-check/src/checks.generated.js'
import { lintDocument, MAX_FINDINGS } from '../packages/dsh-document-check/src/index.js'

// 两扇门必须给出同一份结论：agent 调的工具，和人 POST 的路由。
//
// 这个 kit 从第一天就在防「CLI 说好、面板说不好」——route-parity 测的是路由与直接调用。
// 但 dsh-document-check 之后多了第三扇门：模型通过工具调用同一批规则。三扇门里任意两扇
// 不一致，用户就会拿到两个互相矛盾的裁决，而两边的测试各自绿着。
//
// 判据不是「都不报错」，是「同一份文档在两扇门上得到逐条相同的 findings」：level、rule、
// line、message 四项都一样。工具侧只多两件事：截断到 MAX_FINDINGS，以及去掉各包自己的
// checked 明细（那是给人看面板的，不是给模型看的）。

const ROOT = resolve(import.meta.dirname, '..')
const SIBLING = resolve(ROOT, '../dsh-verify-kit/packages')
const SAMPLE = '# 文档\n\n内容。\n'

async function serverFor(dir) {
  const mod = await import(resolve(dir, 'src', 'index.js'))
  const state = { route: null }
  mod.apply({ webServer: { register(spec) { state.route = spec } }, effect(fn) { fn() } }, {})
  if (!state.route) return null
  const server = createServer((req, res) => state.route.handler(req, res))
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  return { url: `http://127.0.0.1:${port}${state.route.path}`, close: () => new Promise(done => server.close(done)) }
}

test('工具与路由对同一份文档给出同一份结论（32 个检查全覆盖）', async () => {
  assert.ok(CHECKS.length >= 32, `工具只登记了 ${CHECKS.length} 个检查，这条闸失去了覆盖`)
  const failures = []
  let compared = 0
  for (const entry of CHECKS) {
    const candidates = [resolve(ROOT, 'packages', entry.pkg), resolve(SIBLING, entry.pkg)]
    const dir = candidates.find(candidate => existsSync(resolve(candidate, 'src', 'index.js')))
    if (!dir) {
      failures.push(`${entry.slug}: 找不到 ${entry.pkg} 的源码`)
      continue
    }
    const server = await serverFor(dir)
    if (!server) {
      failures.push(`${entry.slug}: ${entry.pkg} 没有注册路由，无法对账`)
      continue
    }
    try {
      const response = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: SAMPLE }),
      })
      const overRoute = await response.json()
      if (response.status !== 200) {
        failures.push(`${entry.slug}: 路由返回 ${response.status} ${JSON.stringify(overRoute).slice(0, 100)}`)
        continue
      }
      const overTool = await lintDocument(entry.slug, SAMPLE)
      compared += 1

      for (const key of ['ok', 'errors', 'warnings']) {
        if (overTool[key] !== overRoute[key]) {
          failures.push(`${entry.slug}: ${key} 工具=${overTool[key]} 路由=${overRoute[key]}`)
        }
      }
      const routeFindings = (overRoute.findings ?? []).map(finding => ({
        level: finding.level,
        rule: finding.rule,
        line: finding.line ?? 0,
        message: finding.message,
      }))
      const expected = routeFindings.slice(0, MAX_FINDINGS)
      if (JSON.stringify(overTool.findings) !== JSON.stringify(expected)) {
        failures.push(
          `${entry.slug}: findings 不一致\n  工具: ${JSON.stringify(overTool.findings).slice(0, 200)}\n  路由: ${JSON.stringify(expected).slice(0, 200)}`,
        )
      }
      if (overTool.truncated !== routeFindings.length > MAX_FINDINGS) {
        failures.push(`${entry.slug}: truncated 标记不对（工具 ${overTool.truncated}，路由给了 ${routeFindings.length} 条）`)
      }
    } finally {
      await server.close()
    }
  }
  assert.ok(compared >= 30, `只对账了 ${compared} 个检查`)
  assert.deepEqual(failures, [], failures.join('\n'))
})

test('工具清单与 slug 集合一一对应（防两处清单各说各话）', () => {
  assert.equal(new Set(SLUGS).size, CHECKS.length)
  for (const entry of CHECKS) assert.ok(SLUGS.includes(entry.slug), `${entry.slug} 不在 SLUGS 里`)
})