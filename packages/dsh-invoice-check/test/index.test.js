import test from 'node:test'
import assert from 'node:assert/strict'
import { lintInvoice } from '../src/index.js'

const good = `电子发票（普通发票）

发票号码：24512000000123456789
统一社会信用代码：91330106MA27X8XXXX

购买方名称：甲科技有限公司
销售方名称：乙网络工作室

不含税金额（小写）：¥11,320.75
税额（小写）：¥679.25
价税合计（小写）：¥12,000.00
价税合计（大写）：壹万贰仟元整
`

test('a consistent invoice passes', () => {
  const result = lintInvoice(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.ok, true)
})

test('net plus tax that misses the total is an error naming all three', () => {
  const result = lintInvoice(good.replace('¥12,000.00', '¥12,001.00'))
  assert.equal(result.ok, false)
  const finding = result.findings.find(entry => entry.rule === 'amount-sum')
  assert.ok(finding)
  assert.match(finding.message, /12000/)
  assert.match(finding.message, /12001/)
})

test('a credit code with excluded letters is an error', () => {
  const result = lintInvoice(good.replace('MA27X8XXXX', 'MA2IOSVZIO'))
  assert.equal(result.ok, false)
  assert.ok(result.findings.some(entry => entry.rule === 'credit-code'))
})

test('an uppercase amount that disagrees with the total is an error', () => {
  const result = lintInvoice(good.replace('壹万贰仟元整', '壹万叁仟元整'))
  const finding = result.findings.find(entry => entry.rule === 'amount-uppercase')
  assert.ok(finding)
  assert.match(finding.message, /13000/)
})

test('a wrong-length invoice number is a warning, not an error', () => {
  const result = lintInvoice(good.replace('24512000000123456789', '245120000001'))
  assert.ok(result.findings.some(entry => entry.rule === 'invoice-number' && entry.level === 'warn'))
  assert.ok(result.findings.every(entry => entry.rule !== 'invoice-number' || entry.level === 'warn'))
})

test('missing buyer or seller blocks are separate errors', () => {
  const result = lintInvoice('发票号码：24512000000123456789\n')
  const rules = result.findings.map(entry => entry.rule).sort()
  assert.deepEqual(rules, ['buyer', 'seller'])
})
