import test from 'node:test'
import assert from 'node:assert/strict'
import { lintBugReport, reproSteps } from '../src/index.js'

const good = `# 登录按钮在 Safari 下无响应

## 环境

- 版本：dsh-review-outbox 0.1.11
- OS：macOS 15.1

## 复现步骤

1. 打开登录页
2. 输入任意账号密码
3. 点击登录按钮

## 预期

跳转到工作台。

## 实际

按钮无响应，控制台无报错。
`

const bad = `今天有人反馈说登录不行，麻烦看看。
`

test('a complete bug report passes', () => {
  const result = lintBugReport(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.steps, 3)
})

test('every defect class is reported', () => {
  const result = lintBugReport(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => `${finding.rule}:${finding.line}`)
  assert.ok(rules.includes('title-missing:1'))
  assert.ok(rules.includes('env-missing:0'))
  assert.ok(rules.includes('repro-missing:0'))
  assert.ok(rules.includes('expected-actual-missing:0'))
})

test('reproSteps collects numbered lines under the repro heading only', () => {
  const text = '# r\n\n## 其他\n\n1. 不是步骤\n\n## 复现步骤\n\n1. 打开页面\n2. 点击按钮\n'
  const steps = reproSteps(text)
  assert.deepEqual(steps.map(step => step.line), [9, 10])
})

test('repro-thin warns below the floor, configurable', () => {
  const text = '# r\n\n## 环境\n\n- 版本：1.0\n\n## 复现步骤\n\n1. 试试看\n\n## 预期\n\n预期正常。\n\n## 实际\n\n实际报错。\n'
  const result = lintBugReport(text)
  assert.ok(result.findings.some(finding => finding.rule === 'repro-thin'))
  const relaxed = lintBugReport(text, { minSteps: 1 })
  assert.ok(!relaxed.findings.some(finding => finding.rule === 'repro-thin'))
})

test('expected without actual is its own error', () => {
  const text = '# r\n\n## 环境\n\n- 版本：1.0\n\n## 复现步骤\n\n1. 打开页面\n\n## 预期\n\n预期正常。\n'
  const result = lintBugReport(text)
  assert.ok(result.findings.some(finding => finding.rule === 'actual-missing'))
})

// expected-missing had only a silent-direction test. A rule that no test makes
// fire is a rule nobody has seen work.
test('actual without expected is an error, and named as such', () => {
  const text = good.replace(/## 预期\n\n[^\n]*\n/, '')
  const result = lintBugReport(text)
  const finding = result.findings.find(f => f.rule === 'expected-missing')
  assert.ok(finding, JSON.stringify(result.findings.map(f => f.rule)))
  assert.equal(finding.level, 'error')
})
