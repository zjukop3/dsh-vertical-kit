import test from 'node:test'
import assert from 'node:assert/strict'
import { scanSource } from '../scripts/audit-regex-assumptions.mjs'

// 两条「英文分词假设」的静态闸，各自两个方向。
//
// 它们在本仓库咬过至少六次：`\b` 紧挨汉字（规则对中文分支静默失效）、行首锚点不带 m 却拿去
// 测整篇文档（带 frontmatter 时永远不匹配）。两次都是「测试全绿、真实文档一跑就崩」。
test('\\b 紧挨汉字：报出来', () => {
  const hits = scanSource("const A = /(?:教育|education)\\b/i\n")
  assert.deepEqual(hits.map(hit => hit.rule), ['cjk-boundary'])
})

test('\\b 只接英文：不报', () => {
  assert.deepEqual(scanSource("const A = /\\beducation\\b/i\n"), [])
  assert.deepEqual(scanSource("const A = /(?:education|项目)\\b/i\n").map(hit => hit.rule), ['cjk-boundary'])
})

test('标题锚点整篇测试却没带 m：报出来', () => {
  const hits = scanSource("  if (/^#\\s+\\S/.test(source)) return 'heading'\n")
  assert.deepEqual(hits.map(hit => hit.rule), ['heading-anchor-without-m'])
})

test('带 m、或显式 (?:^|\\n)、或逐行测试：都不报', () => {
  assert.deepEqual(scanSource("  if (/^#\\s+\\S/m.test(source)) return 'heading'\n"), [])
  assert.deepEqual(scanSource("  if (/(?:^|\\n)#{1,6}\\s/.test(text)) return true\n"), [])
  // 逐行测试是本仓库的常见写法：喂进去的是 `'\n' + line`，不带 m 是对的。
  assert.deepEqual(scanSource("  const ok = lines.some(line => HEADING.test(`\\n${line}`))\n"), [])
})

test('真正扫描本仓库：零命中（闸与代码一致）', async () => {
  const { readdir, readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const root = resolve(import.meta.dirname, '..')
  const rows = []
  for (const slug of await readdir(resolve(root, 'packages'))) {
    const dir = resolve(root, 'packages', slug, 'src')
    let files
    try {
      files = await readdir(dir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.js')) continue
      rows.push(...scanSource(await readFile(resolve(dir, file), 'utf8')).map(hit => `${slug}/${file}:${hit.line} ${hit.rule}`))
    }
  }
  assert.deepEqual(rows, [], rows.join('\n'))
})
