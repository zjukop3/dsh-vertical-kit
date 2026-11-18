import test from 'node:test'
import assert from 'node:assert/strict'
import { lintAdr } from '../src/index.js'

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
  assert.ok(rules.includes('alternatives-missing'))
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

test('the alternatives requirement is configurable away', () => {
  const text = good.replace(/## 备选\n\n[\s\S]*$/, '')
  assert.ok(lintAdr(text).findings.some(finding => finding.rule === 'alternatives-missing'))
  assert.ok(!lintAdr(text, { requireAlternatives: false }).findings.some(finding => finding.rule === 'alternatives-missing'))
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
