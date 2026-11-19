import test from 'node:test'
import assert from 'node:assert/strict'
import { lintPrDescription, checkboxes, whyPolicy } from '../src/index.js'

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

test('describing a breaking-change check is not declaring a breaking change', () => {
  // Two of this project's own merged PRs were flagged breaking-without-migration
  // because the body described the package: "breaking changes announced in a
  // `BREAKING CHANGE:` trailer". A mention inside a sentence, or inside
  // backticks, is not a declaration; a declaration starts its own line.
  const describing = `# 加一个检查

- \`x#dsh-commit-msg-check\` — 提交信息检查：类型前缀、主题长度，以及 breaking changes announced in a \`BREAKING CHANGE:\` trailer rather than buried in the subject.

npm-published at 0.1.0; 73 tests, audit clean.
`
  const result = lintPrDescription(describing)
  assert.ok(!result.findings.some(f => f.rule === 'breaking-without-migration'), JSON.stringify(result.findings))
})

test('a real trailing BREAKING CHANGE line still counts, with text after the colon', () => {
  const declared = `# 改列名

- 导出列改名

BREAKING CHANGE: 导出列顺序变了，下游需按新列名读取。
`
  assert.ok(lintPrDescription(declared).findings.some(f => f.rule === 'breaking-without-migration'))
  const withMigration = `${declared}\n## 迁移\n\n按新列名改读取代码。\n`
  assert.ok(!lintPrDescription(withMigration).findings.some(f => f.rule === 'breaking-without-migration'))
})

test('a bullet list is evidence of what changed, heading or not', () => {
  const doc = `- \`a#dsh-foo-check\` — does one thing

npm-published at 0.1.0; 12 tests, audit clean.
`
  const result = lintPrDescription(doc)
  assert.ok(!result.findings.some(f => f.rule === 'what-missing'), JSON.stringify(result.findings))
})

test('naming a test count is evidence of verification', () => {
  const doc = `Package 3 of the kit:

- \`a#dsh-bar-check\` — one verb

Published at 0.1.0; the kit is now 105 tests across 14 packages, audit 14/14 clean.
`
  assert.ok(!lintPrDescription(doc).findings.some(f => f.rule === 'test-missing'))
})

test('a body with nothing in it still fails what and test', () => {
  const result = lintPrDescription('fix typo\n')
  assert.ok(result.findings.some(f => f.rule === 'what-missing' && f.level === 'error'))
  assert.ok(result.findings.some(f => f.rule === 'test-missing' && f.level === 'error'))
})

test('why warns by default, because motive is not decidable from keywords', () => {
  // "because" appears in explanations of code, not only in reasons. One of this
  // project's own PRs passed why-missing on the strength of the sentence
  // "because `#` is a non-word character" — a regex note, not a motivation.
  const body = `- \`a#c\` — one verb\n\nThe regex drops its leading \\b because \`#\` is a non-word character.\n\n12 tests, audit clean.\n`
  const loose = lintPrDescription(body)
  const why = loose.findings.find(f => f.rule === 'why-missing')
  assert.equal(why.level, 'warn')
  assert.equal(loose.ok, true, 'a warning must not block')

  const strict = lintPrDescription(body, { requireWhy: 'error' })
  assert.equal(strict.findings.find(f => f.rule === 'why-missing').level, 'error')
  assert.equal(strict.ok, false)

  assert.equal(whyPolicy({}), 'warn')
  assert.equal(whyPolicy({ requireWhy: true }), 'error')
  assert.equal(whyPolicy({ requireWhy: 'off' }), 'off')
  assert.equal(whyPolicy({ requireWhy: 'nope' }), 'warn')
})

test('a fenced block cannot supply the what/why/test evidence', () => {
  const doc = `fix typo

\`\`\`text
- a bullet in a fence
because the reason is here
tests 99 passed
BREAKING CHANGE: nope
\`\`\`
`
  const result = lintPrDescription(doc)
  assert.ok(result.findings.some(f => f.rule === 'what-missing'), 'fence is not prose')
  assert.ok(result.findings.some(f => f.rule === 'test-missing'), 'fence is not prose')
})
