import test from 'node:test'
import assert from 'node:assert/strict'
import { lintMeetingNotes, actionItems } from '../src/index.js'

const good = `# 项目周会

- 日期：2026-11-15
- 与会人：张三、李四、王五

## 议程

1. 讨论登录页改版
2. 评审导出性能

## 决定

- 决定：登录页采用新模板，11月20日前上线

## 行动项

- [ ] 登录页模板替换 负责人：张三 11月20日前
- [ ] 导出性能基线测试 @李四 2026-11-22
`

const bad = `# 项目周会

今天讨论了不少事情。

1. 讨论登录页改版
2. 评审导出性能

- [ ] 登录页模板替换
- [ ] 导出性能基线测试 负责人：李四
`

test('a complete note passes', () => {
  const result = lintMeetingNotes(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.actions, 2)
})

test('every defect class is reported', () => {
  const result = lintMeetingNotes(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => `${finding.rule}:${finding.line}`)
  assert.ok(rules.includes('date-missing:0'))
  assert.ok(rules.includes('attendees-missing:0'))
  assert.ok(rules.includes('decisions-missing:0'))
  assert.ok(rules.includes('action-no-owner:8'))
  assert.ok(rules.includes('action-no-deadline:8'))
  assert.ok(rules.includes('action-no-deadline:9'))
})

test('numbered lines under an agenda are not action items', () => {
  const result = lintMeetingNotes(good)
  // the two numbered agenda lines are discussion points, not tasks
  assert.equal(result.checked.actions, 2)
})

test('actionItems picks checkboxes plus numbered lines under an action heading', () => {
  const text = `# 会\n\n## 议程\n\n1. 讨论A\n\n## 待办\n\n1. 发周报 负责人：张三 下周一首\n2. 归档 负责人：李四 11月30日前\n`
  const items = actionItems(text)
  assert.deepEqual(items.map(item => item.number), [9, 10])
})

test('plain numbered notes outside an action heading are not tasks', () => {
  const text = `# 会\n\n1. 讨论A\n2. 讨论B\n`
  assert.deepEqual(actionItems(text), [])
})

test('decisions-missing is a warn with an escape hatch in the message', () => {
  const result = lintMeetingNotes(bad)
  const warning = result.findings.find(finding => finding.rule === 'decisions-missing')
  assert.equal(warning.level, 'warn')
  assert.match(warning.message, /忽略这条/)
})

test('agenda requirement is configurable away', () => {
  const text = `# 会\n\n日期：2026-11-15\n与会人：张三\n\n## 决定\n\n- 决定：继续\n`
  const strict = lintMeetingNotes(text)
  assert.ok(strict.findings.some(finding => finding.rule === 'agenda-missing'))
  const relaxed = lintMeetingNotes(text, { requireAgenda: false })
  assert.ok(!relaxed.findings.some(finding => finding.rule === 'agenda-missing'))
})

test('no-action-items is a warn, not an error', () => {
  const text = `# 会\n\n日期：2026-11-15\n与会人：张三\n\n## 议程\n\n1. 讨论A\n\n## 决定\n\n- 决定：暂不行动\n`
  const result = lintMeetingNotes(text)
  assert.equal(result.ok, true)
  assert.ok(result.findings.some(finding => finding.rule === 'no-action-items'))
})

// 真实语料（TC39 会议纪要）：日期写英文，议程写成「Agenda & notes:」。
// 只认中文与数字日期时，4/4 份真实纪要都被判「没有日期」（2026-11-20）。
test('英文日期也算日期（Tuesday, July 31, 2018）', () => {
  const text = '# Decorators call agenda and notes\n\nTuesday, July 31, 2018, 17:00 UTC\n\nAttendees:\n\n- A\n- B\n\nAgenda & notes:\n\n讨论。\n'
  const result = lintMeetingNotes(text)
  assert.ok(!result.findings.some(f => f.rule === 'date-missing'), JSON.stringify(result.findings.map(f => f.rule)))
})

test('「Agenda & notes:」算议程；完全没有议程仍然报', () => {
  const withAgenda = '# m\n\n2026-11-16\n\nAttendees:\n\n- A\n\nAgenda & notes:\n\n讨论。\n'
  assert.ok(!lintMeetingNotes(withAgenda).findings.some(f => f.rule === 'agenda-missing'))
  const without = '# m\n\n2026-11-16\n\nAttendees:\n\n- A\n\n讨论了一些事。\n'
  assert.ok(lintMeetingNotes(without).findings.some(f => f.rule === 'agenda-missing'))
})

test('一份没有日期的纪要仍然报 date-missing', () => {
  const text = '# m\n\nAttendees:\n\n- A\n\nAgenda:\n\n讨论。\n'
  assert.ok(lintMeetingNotes(text).findings.some(f => f.rule === 'date-missing'))
})
