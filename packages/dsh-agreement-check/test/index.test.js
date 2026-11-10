import test from 'node:test'
import assert from 'node:assert/strict'
import { lintContract, parseUppercaseAmount } from '../src/index.js'

const good = `服务合同

甲方：甲科技有限公司
乙方：乙网络工作室

签订日期：2026年11月10日

一、服务内容与金额
本合同总金额为人民币壹万贰仟元整（¥12,000元）。

二、违约责任
任何一方违约的，应赔偿对方损失。

三、争议解决
因本合同发生的争议，提交甲方所在地人民法院诉讼解决。

四、合同期限
本合同有效期一年。

甲方（盖章）
乙方（盖章）
`

test('a complete contract passes with zero findings', () => {
  const result = lintContract(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.ok, true)
})

test('uppercase amounts parse: yuan, wan, leading shi, decimals', () => {
  assert.equal(parseUppercaseAmount('壹万贰仟元整'), 12000)
  assert.equal(parseUppercaseAmount('人民币壹仟元整'), 1000)
  assert.equal(parseUppercaseAmount('拾万元整'), 100000)
  assert.equal(parseUppercaseAmount('壹万贰仟叁佰肆拾伍元陆角柒分'), 12345.67)
  assert.equal(parseUppercaseAmount('玖佰元整'), 900)
  assert.equal(parseUppercaseAmount('壹拾贰元'), 12)
})

test('unparseable runs return null instead of lying', () => {
  assert.equal(parseUppercaseAmount('甲方责任'), null)
  assert.equal(parseUppercaseAmount('壹佰贰拾'), 120)  // no yuan anchor → integer path
  assert.equal(parseUppercaseAmount('人民币壹佰贰拾元整'), 120)
})

test('a contract without parties fails on both', () => {
  const result = lintContract('一份合同正文，没有当事人。\n\n人民币壹仟元整\n')
  assert.equal(result.ok, false)
  assert.ok(result.findings.some(finding => finding.rule === 'party-a'))
  assert.ok(result.findings.some(finding => finding.rule === 'party-b'))
  assert.ok(result.findings.some(finding => finding.rule === 'signature'))
})

test('a digits-vs-uppercase disagreement is an error naming both values', () => {
  const result = lintContract(good.replace('壹万贰仟元整（¥12,000元）', '壹万贰仟元整（¥13,000元）'))
  assert.equal(result.ok, false)
  const mismatch = result.findings.find(finding => finding.rule === 'amount-mismatch')
  assert.ok(mismatch)
  assert.match(mismatch.message, /12000/)
  assert.match(mismatch.message, /13000/)
})

test('missing dispute or breach clauses are separate errors', () => {
  const result = lintContract('甲方：甲\n乙方：乙\n\n签订日期：2026年1月1日\n\n甲方（盖章）\n乙方（盖章）\n')
  const rules = result.findings.map(finding => finding.rule).sort()
  assert.deepEqual(rules, ['breach', 'dispute', 'term'])
  assert.equal(result.ok, false)
})
