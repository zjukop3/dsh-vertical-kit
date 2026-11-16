import test from 'node:test'
import assert from 'node:assert/strict'
import { lintWeeklyReport, sectionItems } from '../src/index.js'

const good = `# 周报 2026-W46

## 本周完成

- 已上线导出链路重写，p95 从 820ms 降到 460ms
- 已修复 3 个分级 bug

## 下周计划

- 计划完成验收单模板国际化
- 下周对接 2 个新渠道

## 风险

- 阻塞：渠道方接口文档未给出，卡在联调
`

const bad = `# 周报

这周很忙，做了很多事情。
`

test('a complete weekly report passes', () => {
  const result = lintWeeklyReport(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.done, 2)
  assert.equal(result.checked.plan, 2)
  assert.equal(result.checked.risks, 1)
})

test('every defect class is reported', () => {
  const result = lintWeeklyReport(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => `${finding.rule}:${finding.line}`)
  assert.ok(rules.includes('done-missing:0'))
  assert.ok(rules.includes('plan-missing:0'))
  assert.ok(rules.includes('risks-missing:0'))
  assert.ok(rules.includes('metrics-thin:0'))
})

test('self-identifying lines count without a heading', () => {
  const text = '# 周报\n\n本周完成：已上线 2 个功能\n下周计划：计划评审 1 份设计\n风险：暂无\n'
  const result = lintWeeklyReport(text)
  assert.equal(result.checked.done, 1)
  assert.equal(result.checked.plan, 1)
  assert.equal(result.checked.risks, 1)
  assert.ok(!result.findings.some(finding => finding.rule === 'done-missing'))
  assert.ok(!result.findings.some(finding => finding.rule === 'plan-missing'))
})

test('risks-missing is a warn with an escape hatch', () => {
  const text = '# 周报\n\n## 本周完成\n\n- 已上线 1 个功能\n\n## 下周计划\n\n- 计划发布 1 个版本\n'
  const result = lintWeeklyReport(text)
  assert.equal(result.ok, true)
  const warn = result.findings.find(finding => finding.rule === 'risks-missing')
  assert.match(warn.message, /忽略这条/)
})

test('metrics-thin names the floor and the fix', () => {
  const result = lintWeeklyReport(bad)
  const warn = result.findings.find(finding => finding.rule === 'metrics-thin')
  assert.match(warn.message, /下限 1/)
  assert.match(warn.message, /不可检验/)
})

test('the metric floor is configurable', () => {
  const text = '# 周报\n\n## 本周完成\n\n- 已上线 1 个功能，节省 3 小时\n\n## 下周计划\n\n- 计划评审 2 份文档\n\n## 风险\n\n- 暂无\n'
  assert.deepEqual(lintWeeklyReport(text).findings, [])
  const strict = lintWeeklyReport(text, { minMetrics: 3 })
  assert.ok(strict.findings.some(finding => finding.rule === 'metrics-thin'))
})

test('sectionItems collects bullets under the matching heading only', () => {
  const text = '# r\n\n## 本周完成\n\n- 已上线 A\n## 下周计划\n\n- 计划做 B\n'
  const done = sectionItems(text, /(?:^|\n)#{1,6}[^\n]*(?:本周完成|已完成|成果|done|completed|shipped)/i, /本周(?:完成|做了|交付)/)
  assert.deepEqual(done.map(item => item.text), ['- 已上线 A'])
})
