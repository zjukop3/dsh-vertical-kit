import test from 'node:test'
import assert from 'node:assert/strict'
import { lintPrDescription, checkboxes } from '../src/index.js'

const good = `## 概述

把导出的 CSV 编码从 GBK 改为 UTF-8，并在响应头标注 charset。

## 背景

Fixes #412：Windows 用户用 Excel 打开导出文件出现乱码。

## 测试

- 单元测试：新增 3 个用例覆盖编码推导
- 手动验证：下载 CSV 在 Excel 与 Numbers 中均正常
`

const bad = `修了点东西
`

test('a complete description passes', () => {
  const result = lintPrDescription(good)
  assert.deepEqual(result.findings, [])
})

test('every defect class is reported', () => {
  const result = lintPrDescription(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => finding.rule)
  assert.ok(rules.includes('what-missing'))
  assert.ok(rules.includes('why-missing'))
  assert.ok(rules.includes('test-missing'))
  assert.ok(rules.includes('issue-unlinked'))
})

test('checkboxes counts checked and unchecked separately', () => {
  const boxes = checkboxes('- [x] 甲\n- [ ] 乙\n* [X] 丙\n')
  assert.deepEqual(boxes.map(box => box.checked), [true, false, true])
})

test('an all-unchecked checklist is a warn naming the count', () => {
  const text = `${good}\n## 检查项\n\n- [ ] 已加测试\n- [ ] 已更新文档\n`
  const result = lintPrDescription(text)
  const warn = result.findings.find(finding => finding.rule === 'checklist-unchecked')
  assert.ok(warn)
  assert.match(warn.message, /2 个检查项/)
})

test('a partially checked checklist is fine', () => {
  const text = `${good}\n## 检查项\n\n- [x] 已加测试\n- [ ] 已更新文档\n`
  assert.ok(!lintPrDescription(text).findings.some(finding => finding.rule === 'checklist-unchecked'))
})

test('a breaking change without a migration note is an error', () => {
  const text = `${good}\n\nBREAKING CHANGE: 导出列顺序变了。\n`
  const result = lintPrDescription(text)
  assert.ok(result.findings.some(finding => finding.rule === 'breaking-without-migration'))
  const withMigration = `${text}\n## 迁移\n\n下游需按新列名读取。\n`
  assert.ok(!lintPrDescription(withMigration).findings.some(finding => finding.rule === 'breaking-without-migration'))
})

test('the why requirement is configurable', () => {
  const text = '## 概述\n\n改了编码。\n\n## 测试\n\n单元测试通过。\n'
  assert.ok(lintPrDescription(text).findings.some(finding => finding.rule === 'why-missing'))
  assert.ok(!lintPrDescription(text, { requireWhy: false }).findings.some(finding => finding.rule === 'why-missing'))
})

test('an issue reference in any accepted shape satisfies the link rule', () => {
  for (const ref of ['Fixes #12', 'Closes #34', 'refs #56', 'See #78', 'https://github.com/o/r/issues/9', 'related to #101']) {
    const text = `## 概述\n\n改了编码。\n\n## 背景\n\n${ref}\n\n## 测试\n\n单元测试通过。\n`
    assert.ok(!lintPrDescription(text).findings.some(finding => finding.rule === 'issue-unlinked'), ref)
  }
})

test('requireIssue upgrades an unlinked description to an error', () => {
  const text = '## 概述\n\n改了编码。\n\n## 背景\n\n因为乱码。\n\n## 测试\n\n单元测试通过。\n'
  assert.ok(lintPrDescription(text).findings.some(finding => finding.rule === 'issue-unlinked' && finding.level === 'warn'))
  assert.ok(lintPrDescription(text, { requireIssue: true }).findings.some(finding => finding.rule === 'issue-missing' && finding.level === 'error'))
})

test('an empty description is one empty error', () => {
  const result = lintPrDescription('   \n')
  assert.equal(result.ok, false)
  assert.equal(result.findings[0].rule, 'empty')
})
