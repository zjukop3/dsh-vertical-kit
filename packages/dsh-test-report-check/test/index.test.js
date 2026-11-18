import test from 'node:test'
import assert from 'node:assert/strict'
import { lintTestReport, readCounts } from '../src/index.js'

const good = `# 测试报告 2026-11-17

## 测试环境

- Node：v22.19.0
- OS：macOS 15.1

通过 12，失败 1，跳过 0，总计 13

## 失败详情

- 用例 checkout.spec.js > 空购物车提交失败
`

const bad = `# 测试报告

今天跑了测试，大部分都过了。
`

test('a complete test report passes', () => {
  const result = lintTestReport(good)
  assert.deepEqual(result.findings, [])
  assert.deepEqual(result.checked.counts, { passed: 12, failed: 1, skipped: 0, total: 13 })
})

test('every defect class is reported', () => {
  const result = lintTestReport(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => finding.rule)
  assert.ok(rules.includes('counts-missing'))
  assert.ok(rules.includes('env-missing'))
})

test('the arithmetic is checked: 12 + 1 + 0 must equal 13', () => {
  const broken = '# r\n\n环境：macOS\n\n通过 12，失败 1，跳过 0，总计 15\n\n失败详情：x\n'
  const result = lintTestReport(broken)
  const mismatch = result.findings.find(finding => finding.rule === 'sum-mismatch')
  assert.ok(mismatch)
  assert.match(mismatch.message, /12.*1.*0 = 13/)
  assert.match(mismatch.message, /15/)
})

test('readCounts accepts Chinese and English labels', () => {
  assert.deepEqual(readCounts('通过 8，失败 2'), { passed: 8, failed: 2 })
  assert.deepEqual(readCounts('passed 8, failed 2, total 10'), { passed: 8, failed: 2, total: 10 })
  assert.deepEqual(readCounts('成功：5'), { passed: 5 })
})

test('a failing count without a failure section is an error', () => {
  const text = '# r\n\n环境：macOS\n\n通过 10，失败 2，跳过 0，总计 12\n'
  const result = lintTestReport(text)
  assert.ok(result.findings.some(finding => finding.rule === 'failure-detail-missing'))
})

test('counts without a total is a warn, total without parts is a warn', () => {
  const partial = '# r\n\n环境：macOS\n\n通过 8，失败 0\n\n失败详情：无\n'
  assert.ok(lintTestReport(partial).findings.some(finding => finding.rule === 'total-missing' && finding.level === 'warn'))
  const onlyTotal = '# r\n\n环境：macOS\n\n总计 8\n'
  assert.ok(lintTestReport(onlyTotal).findings.some(finding => finding.rule === 'counts-partial' && finding.level === 'warn'))
})
