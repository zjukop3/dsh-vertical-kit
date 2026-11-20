import test from 'node:test'
import assert from 'node:assert/strict'
import { lintAdr, statusOf } from '../src/index.js'

const good = `# ADR-0007 用 Postgres 存会话

状态：已接受

日期：2026-11-18

## 背景

会话数据需要跨实例共享，当前内存方案在多副本下互相看不见。

## 决定

会话写入 Postgres，读取走同一个连接池。

## 后果

- 好处：多副本共享，重启不丢会话
- 代价：每次请求多一次数据库往返，p95 增加约 3ms
- 风险：数据库故障时登录不可用，需降级到只读

## 备选

- Redis：延迟更低，但要多维护一个组件
- 粘性会话：改动最小，但扩缩容时会掉会话
`

test('a complete ADR passes', () => {
  const result = lintAdr(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.consequences, 3)
})

test('missing status, context and decision are each reported', () => {
  const result = lintAdr('随便写点东西。\n')
  const rules = result.findings.map(finding => finding.rule)
  assert.ok(rules.includes('status-missing'))
  assert.ok(rules.includes('context-missing'))
  assert.ok(rules.includes('decision-missing'))
  assert.ok(rules.includes('consequences-missing'))
  // alternatives 现在默认不查（Nygard 模板没有这一节，真实 ADR 5/5 都没有）。
  assert.ok(!rules.includes('alternatives-missing'), rules.join(','))
})

test('consequences with only benefits is a warn about not weighing the trade', () => {
  const text = good.replace('- 代价：每次请求多一次数据库往返，p95 增加约 3ms\n- 风险：数据库故障时登录不可用，需降级到只读', '- 好处：重启不丢会话')
  const result = lintAdr(text)
  const warn = result.findings.find(finding => finding.rule === 'consequences-one-sided')
  assert.ok(warn)
  assert.match(warn.message, /只写收益/)
})

test('consequences with neither label nor cost still warns', () => {
  const text = good.replace(/## 后果\n\n[\s\S]*?\n## 备选/, '## 后果\n\n- 会话存进数据库\n\n## 备选')
  const result = lintAdr(text)
  assert.ok(result.findings.some(finding => finding.rule === 'consequences-unlabelled'))
})

test('a status outside the known set is a warn naming the line', () => {
  const text = good.replace('状态：已接受', '状态：maybe')
  const result = lintAdr(text)
  const warn = result.findings.find(finding => finding.rule === 'status-unknown')
  assert.ok(warn)
  assert.match(warn.message, /maybe/)
})

test('an accepted English status passes', () => {
  const text = good.replace('状态：已接受', 'Status: Accepted')
  assert.ok(!lintAdr(text).findings.some(finding => finding.rule === 'status-missing' || finding.rule === 'status-unknown'))
})

test('the alternatives requirement is off by default and can be turned on', () => {
  const text = good.replace(/## 备选\n\n[\s\S]*$/, '')
  assert.ok(!lintAdr(text).findings.some(finding => finding.rule === 'alternatives-missing'), '默认不该报')
  assert.ok(lintAdr(text, { requireAlternatives: true }).findings.some(finding => finding.rule === 'alternatives-missing'), '打开应报')
})

test('a missing date warns but does not fail', () => {
  const text = good.replace('日期：2026-11-18\n\n', '')
  const result = lintAdr(text)
  assert.ok(result.findings.some(finding => finding.rule === 'date-missing' && finding.level === 'warn'))
  assert.equal(result.ok, true)
})

test('an empty document is one empty error', () => {
  const result = lintAdr('   \n')
  assert.equal(result.ok, false)
  assert.equal(result.findings[0].rule, 'empty')
})

test('a label on its own line still labels the trade', () => {
  // 好处：/代价： written as paragraph lines above the bullets is how a real ADR
  // reads. Judging only the bullet text reported the trade as unlabelled.
  const labelled = `# ADR-0003 选 A

状态：已接受
日期：2026-11-19

## 背景

有两条路。

## 决定

选 A。

## 后果

好处：

- 快

代价：

- 以后要还
`
  const result = lintAdr(labelled)
  assert.ok(!result.findings.some(f => f.rule === 'consequences-unlabelled' || f.rule === 'consequences-one-sided'), JSON.stringify(result.findings))

  const benefitsOnly = `# ADR-0003 选 A

状态：已接受
日期：2026-11-19

## 背景

有两条路。

## 决定

选 A。

## 后果

好处：

- 快
- 省事
`
  const oneSided = lintAdr(benefitsOnly)
  assert.ok(oneSided.findings.some(f => f.rule === 'consequences-one-sided'), 'listing only benefits is still one-sided')
})

// 真实语料（npryce/adr-tools 的 5 份 ADR）：状态是「## Status」这一节下面的一行。
// 只认行内 `Status: x` 会让 5/5 全部判成没有状态——2026-11-20 实测。
const nygard = `# 1. Record architecture decisions

Date: 2016-02-12

## Status

Accepted

## Context

We need to record the architectural decisions made on this project.

## Decision

We will use Architecture Decision Records.

## Consequences

Decisions are recorded as they are made.
`

test('statusOf 认「## Status」下面一行，也认行内写法', () => {
  assert.equal(statusOf(nygard), 'Accepted')
  assert.equal(statusOf('状态：已接受\n\n## 背景\n'), '已接受')
  assert.equal(statusOf('# x\n\n## 背景\n\n没有状态。\n'), null)
})

test('Nygard 模板的真实 ADR 不再被判成没有状态', () => {
  const result = lintAdr(nygard)
  assert.ok(!result.findings.some(f => f.rule === 'status-missing'), JSON.stringify(result.findings.map(f => f.rule)))
})

test('状态取值不认识时仍然 warn', () => {
  const result = lintAdr(nygard.replace('Accepted', 'Probably fine'))
  assert.ok(result.findings.some(f => f.rule === 'status-unknown'))
})

// Nygard 原始模板没有备选方案节：5/5 真实 ADR 都没有，默认报等于噪音。
test('alternatives 默认不查，--require-alternatives 才查', () => {
  const off = lintAdr(nygard)
  const on = lintAdr(nygard, { requireAlternatives: true })
  assert.ok(!off.findings.some(f => f.rule === 'alternatives-missing'), '默认不该报')
  assert.ok(on.findings.some(f => f.rule === 'alternatives-missing'), '开关打开应报')
})
