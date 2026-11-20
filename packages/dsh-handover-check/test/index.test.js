import test from 'node:test'
import assert from 'node:assert/strict'
import { lintHandover, listItems } from '../src/index.js'

const good = `# 平台组交接单

交接人：张三（平台组）
接收人：李四（平台组）
交接日期：2026-11-19

## 交接事项

1. 订单服务的日常运维 — 负责人 李四
2. 灰度发布流程与回滚脚本 — 负责人 王五
3. 与支付网关的对账任务 — 负责人 李四

## 账号与权限

- GitHub 组织 owner：zhangsan@example.com —— 转给 lisi
- 生产数据库只读账号：db-reader —— 已移交
- Jenkins 部署密钥：已轮换，旧密钥作废

## 未完成事项

- 对账任务的月度报表还没迁完，负责人 李四，预计 11 月 28 日前完成

## 签字确认

接收人已确认上述事项与权限均已核对。
`

test('a complete handover passes with zero findings', () => {
  const result = lintHandover(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.ok, true)
  assert.equal(result.checked.items, 3)
  assert.equal(result.checked.accounts, true)
})

test('an empty document is a single empty error', () => {
  const result = lintHandover('   \n')
  assert.equal(result.errors, 1)
  assert.equal(result.findings[0].rule, 'empty')
})

test('a handover with no person named is an error', () => {
  const result = lintHandover(good.replace('交接人：张三（平台组）\n', ''))
  const finding = result.findings.find(f => f.rule === 'handover-person-missing')
  assert.ok(finding, JSON.stringify(result.findings.map(f => f.rule)))
  assert.equal(finding.level, 'error')
})

test('a handover with no receiver is an error', () => {
  const result = lintHandover(good.replace('接收人：李四（平台组）\n', ''))
  const finding = result.findings.find(f => f.rule === 'receiver-missing')
  assert.ok(finding, JSON.stringify(result.findings.map(f => f.rule)))
  assert.equal(finding.level, 'error')
})

test('no date is an error; an unlabelled date is only a warning', () => {
  const none = lintHandover(good.replace('交接日期：2026-11-19\n', ''))
  assert.equal(none.findings.find(f => f.rule === 'date-missing').level, 'error')

  const unlabelled = lintHandover(good.replace('交接日期：2026-11-19', '2026-11-19'))
  const finding = unlabelled.findings.find(f => f.rule === 'date-unlabelled')
  assert.ok(finding, JSON.stringify(unlabelled.findings.map(f => f.rule)))
  assert.equal(finding.level, 'warn')
})

test('fewer than three listed items is an error', () => {
  const text = good.replace('2. 灰度发布流程与回滚脚本 — 负责人 王五\n3. 与支付网关的对账任务 — 负责人 李四\n', '')
  const finding = lintHandover(text).findings.find(f => f.rule === 'items-thin')
  assert.ok(finding, JSON.stringify(lintHandover(text).findings.map(f => f.rule)))
  assert.equal(finding.level, 'error')
})

test('items with no owner anywhere is a warning, not an error', () => {
  const text = good
    .replace('1. 订单服务的日常运维 — 负责人 李四', '1. 订单服务的日常运维')
    .replace('2. 灰度发布流程与回滚脚本 — 负责人 王五', '2. 灰度发布流程与回滚脚本')
    .replace('3. 与支付网关的对账任务 — 负责人 李四', '3. 与支付网关的对账任务')
    .replace('，负责人 李四，预计 11 月 28 日前完成', '，预计 11 月 28 日前完成')
  const finding = lintHandover(text).findings.find(f => f.rule === 'no-owners')
  assert.ok(finding, JSON.stringify(lintHandover(text).findings.map(f => f.rule)))
  assert.equal(finding.level, 'warn')
})

test('a handover with no accounts section is the error the package exists for', () => {
  const text = good.replace(/## 账号与权限[\s\S]*?(?=## 未完成事项)/, '')
  const finding = lintHandover(text).findings.find(f => f.rule === 'access-unlisted')
  assert.ok(finding, JSON.stringify(lintHandover(text).findings.map(f => f.rule)))
  assert.equal(finding.level, 'error')
})

test('an accounts section that names nothing concrete warns, and "no accounts" satisfies it', () => {
  const vague = good.replace(/## 账号与权限[\s\S]*?(?=## 未完成事项)/, '## 账号与权限\n\n详见 wiki。\n\n')
  const warning = lintHandover(vague).findings.find(f => f.rule === 'access-empty')
  assert.ok(warning, JSON.stringify(lintHandover(vague).findings.map(f => f.rule)))
  assert.equal(warning.level, 'warn')

  const explicitNone = good.replace(/## 账号与权限[\s\S]*?(?=## 未完成事项)/, '## 账号与权限\n\n无账号需交接，本岗位只使用共享只读账号。\n\n')
  assert.deepEqual(lintHandover(explicitNone).findings, [])
})

test('no pending section warns, and the requirement is configurable away', () => {
  const text = good.replace(/## 未完成事项[\s\S]*?(?=## 签字确认)/, '')
  const finding = lintHandover(text).findings.find(f => f.rule === 'pending-missing')
  assert.ok(finding, JSON.stringify(lintHandover(text).findings.map(f => f.rule)))
  assert.equal(finding.level, 'warn')
  assert.deepEqual(lintHandover(text, { requirePending: false }).findings, [])
})

test('no sign-off is an error', () => {
  const text = good.replace(/## 签字确认[\s\S]*$/, '')
  const finding = lintHandover(text).findings.find(f => f.rule === 'signoff-missing')
  assert.ok(finding, JSON.stringify(lintHandover(text).findings.map(f => f.rule)))
  assert.equal(finding.level, 'error')
})

test('a fenced block cannot supply the structure', () => {
  // The lesson from the rest of this kit: a document that quotes a good
  // handover is not a good handover.
  const text = `# 交接\n\n格式参考：\n\n\`\`\`markdown\n${good}\`\`\`\n`
  const result = lintHandover(text)
  assert.ok(result.findings.some(f => f.rule === 'handover-person-missing'), 'the fence is not the document')
  assert.ok(result.findings.some(f => f.rule === 'access-unlisted'))
})

test('listItems counts numbered and bulleted lines only', () => {
  assert.equal(listItems('1. a\n- b\n* c\n文字\n').length, 3)
  assert.equal(listItems('没有列表').length, 0)
})
test('a receiver slot filled with a non-answer is still a gap', () => {
  // Found by writing this project's own handover: it says `接收人：尚未指定`, and
  // the rule accepted it because it looked for the label and never for a name.
  for (const value of ['尚未指定', '待定', 'TBD', '无', '—']) {
    const result = lintHandover(good.replace('接收人：李四（平台组）', `接收人：${value}`))
    const finding = result.findings.find(f => f.rule === 'receiver-unassigned')
    assert.ok(finding, `${value}: ${JSON.stringify(result.findings.map(f => f.rule))}`)
    assert.equal(finding.level, 'error')
  }
})

test('a real name, a parenthesised team, or a trailing note still pass', () => {
  for (const value of ['李四', '李四（平台组）', 'Li Si', '李四 / 交接后由王五代管']) {
    const result = lintHandover(good.replace('接收人：李四（平台组）', `接收人：${value}`))
    assert.ok(!result.findings.some(f => f.rule === 'receiver-unassigned'), `${value}: ${JSON.stringify(result.findings.map(f => f.rule))}`)
  }
})

// 真实语料（3 份公开 HANDOVER.md）：其中两份是英文会话交接、一份是中文
// 「接棒 Agent 关键须知」。这类文档没有接收人、没有账号转移、没有签字——
// 用人交接的七条规则判它，7 条全报（2026-11-20 实测 0/3 零发现）。
const sessionHandover = `# Handover — Session 2026-03-03

## Current State

Everything builds green.

## What Was Done This Session

- Fixed the parser.

## Files Changed

- \`src/parse.js\`

## Next Session

Pick up the writer.
`

test('会话交接只得到一条 technical-handover warn，不再逐条报人交接的规则', () => {
  const result = lintHandover(sessionHandover)
  assert.deepEqual(result.findings.map(f => f.rule), ['technical-handover'])
  assert.equal(result.ok, true)
  assert.equal(result.checked.sessionHandover, true)
})

test('中文的会话交接也认得，且不被硬件里的 Receiver 骗成「人交接」', () => {
  const chinese = `# 接棒 Agent 关键须知\n\n## 本次已完成\n\n- 修了 USB Receiver 的识别\n\n## 关键须知\n\n下一段会话从这里开始。\n`
  const result = lintHandover(chinese)
  assert.deepEqual(result.findings.map(f => f.rule), ['technical-handover'])
})

test('真正的人交接不会被判成会话交接', () => {
  const human = `# 交接单\n\n交接人：张三\n接收人：李四\n生效日期：2026-11-20\n\n## 事项\n\n- 交付 A（负责人：张三）\n\n## 账号与权限\n\n- 无账号需交接\n\n## 未完成事项\n\n- B\n\n接收人签字：李四\n`
  const result = lintHandover(human)
  assert.ok(!result.findings.some(f => f.rule === 'technical-handover'), JSON.stringify(result.findings.map(f => f.rule)))
})
