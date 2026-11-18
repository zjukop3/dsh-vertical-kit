import test from 'node:test'
import assert from 'node:assert/strict'
import { lintIncidentReport, timelineEntries, actionItems } from '../src/index.js'

const good = `# 导出服务中断复盘（2026-11-18）

## 影响

影响：全部导出任务不可用，约 1,200 次请求失败，持续 23 分钟。

## 时间线

- 14:02 监控告警：导出队列积压超过阈值
- 14:10 定位到连接池耗尽
- 14:25 扩容连接池并重启消费者

## 根因

根因：连接池上限 10 与并发消费者数量不匹配，新增消费者后池耗尽。

## 行动项

- [ ] 连接池上限改为按消费者数推导 负责人：张三
- [ ] 补充队列积压告警阈值 负责人：李四
`

const bad = `# 服务挂了

今天下午服务挂了，重启后恢复了。
`

test('a complete postmortem passes', () => {
  const result = lintIncidentReport(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.timeline, 3)
  assert.equal(result.checked.actions, 2)
})

test('every defect class is reported', () => {
  const result = lintIncidentReport(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => finding.rule)
  assert.ok(rules.includes('timeline-missing'))
  assert.ok(rules.includes('impact-missing'))
  assert.ok(rules.includes('root-cause-missing'))
  assert.ok(rules.includes('actions-missing'))
  assert.ok(rules.includes('duration-missing'))
})

test('an untimed timeline entry is an error naming its line', () => {
  const text = good.replace('- 14:10 定位到连接池耗尽', '- 后来定位到连接池耗尽')
  const result = lintIncidentReport(text)
  const untimed = result.findings.find(finding => finding.rule === 'timeline-entry-untimed')
  assert.ok(untimed)
  assert.match(untimed.message, /后来定位/)
})

test('timelineEntries reads both bullet and numbered forms', () => {
  const text = '# r\n\n## 时间线\n\n- 14:02 告警\n1. 14:10 定位\n'
  const entries = timelineEntries(text)
  assert.equal(entries.length, 2)
  assert.ok(entries.every(entry => entry.hasTime))
})

test('a timeline under the floor warns, and the floor is configurable', () => {
  const text = '# r\n\n## 时间线\n\n- 14:02 告警\n\n## 影响\n\n影响：无\n\n## 根因\n\n根因：x\n\n## 行动项\n\n- [ ] 做事 负责人：甲\n'
  assert.ok(lintIncidentReport(text).findings.some(finding => finding.rule === 'timeline-thin'))
  assert.ok(!lintIncidentReport(text, { minTimeline: 1 }).findings.some(finding => finding.rule === 'timeline-thin'))
})

test('a follow-up without an owner is an error', () => {
  const text = good.replace('- [ ] 补充队列积压告警阈值 负责人：李四', '- [ ] 补充队列积压告警阈值')
  const result = lintIncidentReport(text)
  assert.ok(result.findings.some(finding => finding.rule === 'action-no-owner'))
})

test('actionItems reads checkbox and @name owners', () => {
  const text = '# r\n\n## 行动项\n\n- [ ] 甲事 负责人：张三\n- [ ] 乙事 @lisi\n'
  const items = actionItems(text)
  assert.equal(items.length, 2)
  assert.ok(items.every(item => item.hasOwner))
})

test('duration is a warn by default and can be required', () => {
  const text = good.replace('持续 23 分钟', '持续了一段时间').replace('约 1,200 次请求失败', '若干请求失败')
  const result = lintIncidentReport(text)
  assert.ok(result.findings.some(finding => finding.rule === 'duration-missing' && finding.level === 'warn'))
  assert.ok(lintIncidentReport(text, { requireDuration: false }).findings.every(finding => finding.rule !== 'duration-missing'))
})

test('time formats recognized: with date, with seconds, with PM', () => {
  const text = '# r\n\n## 时间线\n\n- 2026-11-18 14:02:05 告警\n- 2:32 PM 恢复\n'
  assert.ok(timelineEntries(text).every(entry => entry.hasTime))
})
