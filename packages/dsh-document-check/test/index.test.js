import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { CHECKS, SLUGS, BY_SLUG } from '../src/checks.generated.js'
import { lintDocument, resolveSlug, defineDocumentCheckTool, MAX_FINDINGS, apply } from '../src/index.js'

const HERE = resolve(import.meta.dirname, '..')
const ROOT = resolve(HERE, '../..')
const SIBLING = resolve(ROOT, '../dsh-verify-kit/packages')

// 这条工具的价值全压在一句话上：「31 个检查，一个都能调」。
// 一旦清单漏了、导出名写错、或者某个检查的签名变了，这句话就是假的，而调用方看到的
// 只是「这个检查不认识」——比报错更没有信息量。所以每个 slug 都要真的跑一遍。
test('清单里每个 slug 都指向一个真实存在、能跑出结果的检查', async () => {
  assert.ok(CHECKS.length >= 31, `只有 ${CHECKS.length} 个检查`)
  const failures = []
  for (const entry of CHECKS) {
    const dir = existsSync(resolve(ROOT, 'packages', entry.pkg))
      ? resolve(ROOT, 'packages', entry.pkg)
      : resolve(SIBLING, entry.pkg)
    if (!existsSync(resolve(dir, 'src', 'index.js'))) {
      failures.push(`${entry.slug}: ${entry.pkg} 的 src/index.js 不存在`)
      continue
    }
    const mod = await import(resolve(dir, 'src', 'index.js'))
    if (typeof mod[entry.exportName] !== 'function') {
      failures.push(`${entry.slug}: ${entry.pkg} 没有导出 ${entry.exportName}`)
      continue
    }
    // 真正跑一次：任何合法文本都不该抛异常，返回的形状必须是工具承诺的那个。
    const result = await lintDocument(entry.slug, '# 标题\n\n内容。\n')
    for (const field of ['check', 'ok', 'errors', 'warnings', 'findings', 'truncated']) {
      if (!(field in result)) failures.push(`${entry.slug}: 返回缺少 ${field}`)
    }
    if (result.check !== entry.slug) failures.push(`${entry.slug}: 返回的 check 是 ${result.check}`)
  }
  assert.deepEqual(failures, [], failures.join('\n'))
})

test('slug 唯一，且每个都是包名去掉 dsh- 与 -check 之后的形状', () => {
  assert.equal(new Set(SLUGS).size, SLUGS.length, 'slug 有重复')
  for (const entry of CHECKS) {
    const expected = entry.pkg.replace(/^dsh-/, '')
    assert.ok(
      SLUGS.includes(expected) || SLUGS.includes(expected.replace(/-check$/, '')),
      `${entry.pkg} 的 slug（${expected}）不在清单里；生成器和包名脱节了`,
    )
  }
})

// 「枚举之外的值会不会被拒」取决于宿主：`defineTool` 在 @deepseek-ai/dsh-tools
// 0.1.0-rc.6（Desktop 提供的那个）里会在 execute 前做 schema 校验，在 0.2.2-rc.5（本仓库
// devDependency）里不会。所以这条测试只断言我们自己保证的部分：lintDocument 宽容地把
// adr 归一到 adr-check，而 schema 里的 enum 就是那 31 个精确值。
// 第一版 README 写成「工具也宽容」，在装好的 Desktop 上是错的——这个差别是实测发现的。
test('宽容发生在 lintDocument 这一层；schema 枚举仍只列精确值', async () => {
  const tool = defineDocumentCheckTool()
  assert.ok(tool.parameters.properties.check.enum.includes('adr-check'))
  assert.ok(!tool.parameters.properties.check.enum.includes('adr'), '枚举里不该有短写：模型照抄枚举值')
  const value = await lintDocument('adr', '# ADR-1\n\n## 背景\n\n慢。\n')
  assert.equal(value.check, 'adr-check')
})

test('检查名的拼法宽容：adr / adr-check / ADR-CHECK / dsh-adr-check 都落到同一个', () => {
  assert.equal(resolveSlug('adr'), 'adr-check')
  assert.equal(resolveSlug('adr-check'), 'adr-check')
  assert.equal(resolveSlug('ADR-CHECK'), 'adr-check')
  assert.equal(resolveSlug('dsh-adr-check'), 'adr-check')
  assert.equal(resolveSlug(' citelint '), 'citelint')
  assert.equal(resolveSlug('nope'), null)
  assert.equal(resolveSlug(''), null)
})

test('不认识的检查名报错时把可选值列出来，而不是只说「不认识」', async () => {
  await assert.rejects(
    () => lintDocument('no-such-check', 'x'),
    error => error.code === 'UNKNOWN_CHECK' && error.message.includes('adr-check') && error.message.includes('tablelint'),
  )
})

test('空文本被拒：检查空文档没有意义，静默返回 ok 更糟', async () => {
  await assert.rejects(() => lintDocument('adr-check', '   '), error => error.code === 'EMPTY_TEXT')
})

test('截断是显式的：超过上限时把前 MAX_FINDINGS 条给出来并标记', async () => {
  // dsh-test-report-check 对一份啥都没有的报告会一口气报很多条，正好用来验上限。
  const empty = '# \n'
  const result = await lintDocument('test-report-check', empty)
  assert.ok(result.findings.length <= MAX_FINDINGS, `给了 ${result.findings.length} 条，超过上限 ${MAX_FINDINGS}`)
  assert.equal(typeof result.truncated, 'boolean')
})

test('工具定义本身：名字、必填参数、枚举值都对得上清单', () => {
  const tool = defineDocumentCheckTool()
  assert.equal(tool.name, 'document_check')
  assert.match(tool.description, /before delivering/i)
  // defineTool 把参数 DSL 编译成 JSON Schema：必填是顶层 required 数组，不是每个参数上的布尔。
  assert.deepEqual(tool.parameters.required, ['check', 'text'])
  assert.deepEqual(tool.parameters.properties.check.enum, SLUGS)
  assert.equal(tool.parameters.properties.check.type, 'string')
  assert.equal(tool.parameters.properties.text.type, 'string')
  assert.equal(tool.output.schema.properties.findings.type, 'array')
})

test('CLI 与工具调用同一份实现：同一个文件，两边结论一样', async () => {
  const fixture = '# ADR-014 采用事件溯源\n\n## 背景\n\n订单服务写放大严重。\n'
  const file = resolve(HERE, 'test', '.tmp-adr.md')
  await import('node:fs/promises').then(fs => fs.writeFile(file, fixture, 'utf8'))
  try {
    const direct = await lintDocument('adr-check', fixture)
    // 出口码 1 是「有 findings」，不是失败——execFileSync 会当异常抛，所以自己接住 stdout。
    let printed
    try {
      printed = execFileSync(process.execPath, [resolve(HERE, 'bin', 'cli.js'), 'adr-check', file, '--json'], { encoding: 'utf8' })
    } catch (error) {
      if (error.status !== 1) throw error
      printed = String(error.stdout)
    }
    printed = JSON.parse(printed)
    assert.deepEqual(printed, direct)
  } finally {
    await import('node:fs/promises').then(fs => fs.rm(file, { force: true }))
  }
})

test('README 里那条命令真的能跑（陌生人路径）', async () => {
  const readme = await readFile(resolve(HERE, 'README.md'), 'utf8')
  const command = readme.match(/npx\s+(dsh-document-check)\s+(\S+)\s+(\.\/\S+)/)
  assert.ok(command, 'README 没有给出 npx dsh-document-check <check> <file> 形式的命令')
  assert.equal(command[1], 'dsh-document-check', 'npx 后面必须是包名')
})

test('依赖清单 = 清单里的每个包，不写死版本', async () => {
  const manifest = JSON.parse(await readFile(resolve(HERE, 'package.json'), 'utf8'))
  const names = Object.keys(manifest.dependencies).sort()
  assert.deepEqual(names, CHECKS.map(entry => entry.pkg).sort())
  for (const [pkg, range] of Object.entries(manifest.dependencies)) {
    assert.match(range, /^\^\d+\.\d+\.\d+$/, `${pkg} 的版本范围不是 ^x.y.z：${range}`)
  }
})

test('bundle patch 只有一行，id 不与包自己的路由行撞车', async () => {
  const patch = await readFile(resolve(HERE, 'cordis.patch.yml'), 'utf8')
  const ids = [...patch.matchAll(/-\s*id:\s*([\w-]+)/g)].map(match => match[1])
  const names = [...patch.matchAll(/name:\s*'([^']+)'/g)].map(match => match[1])
  assert.deepEqual(names, ['dsh-document-check'])
  assert.deepEqual(ids, ['document-check'])
})

// 这条对应别的包的 route-parity：注册这一步本身要被观察到。
// 一条工具最坏的失败是「装上了但没注册」——包在，agent 却看不见它，而任何只看
// `dsh plugin why` 的核实都会说一切正常。
test('apply() 真的注册了一条工具，并且执行链路能跑到底', async () => {
  const registered = []
  const ctx = { tools: { register(tool) { registered.push(tool); return () => {} } }, effect(fn) { fn() } }
  apply(ctx)
  assert.equal(registered.length, 1, `注册了 ${registered.length} 条工具`)
  const tool = registered[0]
  assert.equal(tool.name, 'document_check')

  const value = await tool.execute({ check: 'adr-check', text: '# ADR-014 采用事件溯源\n\n## 背景\n\n订单服务写放大严重。\n' }, {})
  assert.equal(value.check, 'adr-check')
  assert.equal(value.ok, false)
  assert.ok(value.errors >= 1, '这份 ADR 缺状态/决定/后果，至少一条 error')
  // 渲染就是模型看到的那段文字：必须自带结论，否则模型只看到一串 findings。
  const blocks = tool.output.render({}, value)
  assert.equal(blocks[0].type, 'text')
  assert.match(blocks[0].text, /^fail: adr-check — \d+ error\(s\)/)
})
