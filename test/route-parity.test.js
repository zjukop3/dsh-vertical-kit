// Route and direct call must produce the same answer.
//
// Every package's README says the CLI and the host route share one
// implementation "so they cannot disagree". The CLI is tested. The route was
// asserted, not measured — the DSH host was never available in this environment,
// so the claim rested on reading the code. This test closes that gap without
// DSH: call the exported apply() with a minimal ctx, serve the registered
// handler over a real socket, and compare the HTTP response to the direct call
// byte for byte.
//
// It also checks the two behaviours a caller depends on: a non-POST method is
// refused with 405, and a request with neither text nor path is refused with
// 400.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CASES = [
  { pkg: 'dsh-agreement-check', lint: 'lintContract', path: '/agreement-check/api', sample: '甲方：甲公司\n乙方：乙公司\n' },
  { pkg: 'dsh-invoice-check', lint: 'lintInvoice', path: '/invoice-check/api', sample: '发票号码：24512000000123456789\n' },
  { pkg: 'dsh-listing-check', lint: 'lintListings', path: '/listing-check/api', sample: 'title,price,sku\n超便宜, 0, SKU001\n' },
  { pkg: 'dsh-meeting-notes-check', lint: 'lintMeetingNotes', path: '/meeting-notes-check/api', sample: '# 周会\n\n今天讨论了很多。\n' },
  { pkg: 'dsh-resume-check', lint: 'lintResume', path: '/resume-check/api', sample: '# 张三\n\nA公司 2020.1 - 2021.1\n' },
  { pkg: 'dsh-release-notes-check', lint: 'lintReleaseNotes', path: '/release-notes-check/api', sample: '# Changelog\n\n改了点东西。\n' },
  { pkg: 'dsh-weekly-report-check', lint: 'lintWeeklyReport', path: '/weekly-report-check/api', sample: '# 周报\n\n很忙。\n' },
  { pkg: 'dsh-bug-report-check', lint: 'lintBugReport', path: '/bug-report-check/api', sample: '# 登录坏了\n\n今天登录不行。\n' },
  { pkg: 'dsh-api-doc-check', lint: 'lintApiDoc', path: '/api-doc-check/api', sample: '# 接口\n\n在 /v1/x 上。\n' },
  { pkg: 'dsh-test-report-check', lint: 'lintTestReport', path: '/test-report-check/api', sample: '# 测试报告\n\n都过了。\n' },
  { pkg: 'dsh-commit-msg-check', lint: 'lintCommitMessage', path: '/commit-msg-check/api', sample: '修了点东西\n' },
  { pkg: 'dsh-dockerfile-check', lint: 'lintDockerfile', path: '/dockerfile-check/api', sample: 'FROM node\n' },
  { pkg: 'dsh-env-example-check', lint: 'lintEnvExample', path: '/env-example-check/api', sample: 'A=1\n' },
  { pkg: 'dsh-license-check', lint: 'lintLicense', path: '/license-check/api', sample: 'Copyright 2026 someone\n' },
  { pkg: 'dsh-incident-report-check', lint: 'lintIncidentReport', path: '/incident-report-check/api', sample: '# 事故\n\n挂了。\n' },
  { pkg: 'dsh-ops-runbook-check', lint: 'lintOpsRunbook', path: '/ops-runbook-check/api', sample: '# 手册\n\n1. 停服务\n' },
  { pkg: 'dsh-pr-description-check', lint: 'lintPrDescription', path: '/pr-description-check/api', sample: '修了点东西\n' },
  { pkg: 'dsh-spec-doc-check', lint: 'lintSpecDoc', path: '/spec-doc-check/api', sample: '# 方案\n\n想重做。\n' },
  { pkg: 'dsh-adr-check', lint: 'lintAdr', path: '/adr-check/api', sample: '# ADR-1\n\n## 背景\n\n慢。\n' },
  { pkg: 'dsh-onboarding-check', lint: 'lintOnboarding', path: '/onboarding-check/api', sample: '# 上手\n\n挺好的。\n' },
]

async function withServer(handler, run) {
  const server = createServer((request, response) => handler(request, response))
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  try {
    return await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise(done => server.close(done))
  }
}

// The ctx a DSH host provides, reduced to what these packages use.
function makeCtx() {
  const state = { route: null }
  const ctx = {
    webServer: { register(spec) { state.route = spec } },
    effect(fn) { fn() },
  }
  return { ctx, state }
}

// 手写样例只管「有意义的输入」；覆盖面归目录。第一版只有这 20 条，剩下 7 个包
// （contributing / expense-claim / handover / migration-guide / perf-report /
// privacy-notice / security-advisory）根本没被这条闸看过——修 bug 的时候我改了 24 个
// 文件，闸只认得其中 17 个。所以没写样例的包也用一句通用文本进来跑：这三条断言比的是
// 「两条路是否一致」，一致性不需要有意义的输入。
const PACKAGES = resolve(import.meta.dirname, '../packages')
const GENERIC_SAMPLE = '# 文档\n\n内容。\n'
const known = new Map(CASES.map(entry => [entry.pkg, entry]))
const ENTRIES = [...CASES]
for (const dir of readdirSync(PACKAGES).sort()) {
  if (known.has(dir)) continue
  const src = join(PACKAGES, dir, 'src/index.js')
  if (!existsSync(src)) continue // bundle 没有运行时代码
  const mod = await import(`../packages/${dir}/src/index.js`)
  const lint = Object.keys(mod).find(key => /^lint[A-Z]/.test(key))
  if (!lint || typeof mod.apply !== 'function') continue
  ENTRIES.push({ pkg: dir, lint, path: null, sample: GENERIC_SAMPLE })
}

for (const entry of ENTRIES) {
  test(`${entry.pkg}: the route returns exactly what the direct call returns`, async () => {
    const mod = await import(`../packages/${entry.pkg}/src/index.js`)
    assert.equal(typeof mod.apply, 'function', `${entry.pkg} must export apply`)
    assert.equal(typeof mod[entry.lint], 'function', `${entry.pkg} must export ${entry.lint}`)

    const { ctx, state } = makeCtx()
    mod.apply(ctx, {})
    assert.ok(state.route, `${entry.pkg} apply() must register a route`)
    if (entry.path) assert.equal(state.route.path, entry.path)

    await withServer(state.route.handler, async base => {
      const response = await fetch(`${base}${state.route.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: entry.sample }),
      })
      assert.equal(response.status, 200)
      const overHttp = await response.json()
      const direct = mod[entry.lint](entry.sample)
      assert.deepEqual(overHttp, direct, `${entry.pkg}: route and direct call disagree`)
    })
  })

  // 文档说「text 或 path 二选一」。第一版只测了 text，于是 path 那条分支从来没跑过。
  // 2026-11-23 在真机上按文档 POST {"path": …}：24 个包坏在同一种写法上——
  //   (await import('node:fs/promises')).readFile(...) 少了最外面的 await，
  // 拿到的是 Promise。有的包当场 400「text.split is not a function」，更糟的是
  // commit-msg-check 把 String(promise) 当成正文，对所有 path 请求稳定给出
  // subject=16（"[object Promise]" 的长度）和一条 type-missing——不是报错，是
  // 一本正经地给假判决。判据是「同一份文档走两条路必须给同一个答复」，不是「path 不报错」。
  test(`${entry.pkg}: path 分支必须与 text 分支给出同一个答复`, async () => {
    const mod = await import(`../packages/${entry.pkg}/src/index.js`)
    const { ctx, state } = makeCtx()
    mod.apply(ctx, {})

    const dir = mkdtempSync(join(tmpdir(), 'dsh-route-parity-'))
    const file = join(dir, 'sample.txt')
    writeFileSync(file, entry.sample, 'utf8')
    try {
      await withServer(state.route.handler, async base => {
        const response = await fetch(`${base}${state.route.path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: file }),
        })
        const body = await response.json()
        assert.equal(response.status, 200, `${entry.pkg}: path 分支状态码 ${response.status}，body=${JSON.stringify(body).slice(0, 120)}`)
        assert.deepEqual(body, mod[entry.lint](entry.sample), `${entry.pkg}: 同一份文档，path 与 text 给出不同答复`)
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test(`${entry.pkg}: the route refuses a GET and an empty body`, async () => {
    const mod = await import(`../packages/${entry.pkg}/src/index.js`)
    const { ctx, state } = makeCtx()
    mod.apply(ctx, {})

    await withServer(state.route.handler, async base => {
      const get = await fetch(`${base}${state.route.path}`)
      assert.equal(get.status, 405)
      assert.match(String((await get.json()).error), /POST only/)

      const empty = await fetch(`${base}${state.route.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      assert.equal(empty.status, 400)
      assert.match(String((await empty.json()).error), /text or path is required/)
    })
  })
}

test('the route honours a configured mount path', async () => {
  const mod = await import('../packages/dsh-listing-check/src/index.js')
  const { ctx, state } = makeCtx()
  mod.apply(ctx, { path: '/custom/mount' })
  assert.equal(state.route.path, '/custom/mount')
})