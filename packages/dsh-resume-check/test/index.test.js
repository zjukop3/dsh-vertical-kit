import test from 'node:test'
import assert from 'node:assert/strict'
import { lintResume, dateRanges } from '../src/index.js'

const good = `# 张三

- 电话：138-0013-8000
- 邮箱：zhangsan@example.com

## 工作经历

**字节跳动** 高级工程师 2020.3 - 2022.5
负责导出链路稳定性

**腾讯** 工程师 2022.6 - 至今
负责支付网关

## 教育背景

某某大学 本科 2016.9 - 2020.6
`

const bad = `# 李四

- 邮箱：lisi..wrong@site
- 电话：12345

## 工作经历

**A公司** 工程师 2020.1 - 2022.6
**B公司** 工程师 2021.5 - 2023.1
**C公司** 工程师 2022.3 - 至今
**D公司** 工程师 2023.2 - 2024.1
`

test('a clean resume passes', () => {
  const result = lintResume(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.ranges, 3)
})

test('every defect class is reported on its own line', () => {
  const result = lintResume(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => `${finding.rule}:${finding.line}`)
  assert.ok(rules.includes('email-invalid:3'))
  assert.ok(rules.includes('phone-invalid:4'))
  assert.ok(rules.includes('dates-overlap:9'))
  assert.ok(rules.includes('dates-overlap:10'))
  assert.ok(rules.includes('dates-order:11'))
})

test('dateRanges parses the four supported shapes', () => {
  const ranges = dateRanges('a 2020.3-2022.5 b\n2020年3月-2022年5月\n2020/3 ~ 2022/5\n2020-03 至今\n')
  assert.equal(ranges.length, 4)
  assert.deepEqual(ranges.map(range => range.end), [24269, 24269, 24269, 'open'])
})

test('a gap is informative, not a defect, unless allowGaps is off', () => {
  const text = '# r\n\n电话：138-0013-8000\n邮箱：a@b.co\n\n## 工作经历\n\nA 2018.1 - 2019.1\nB 2021.1 - 2022.1\n\n## 教育背景\n\n某某大学 本科\n'
  assert.deepEqual(lintResume(text).findings, [])
  const strict = lintResume(text, { allowGaps: false })
  assert.ok(strict.findings.some(finding => finding.rule === 'date-gap'))
})

test('education-missing is a warn', () => {
  const text = '# r\n\n电话：138-0013-8000\n邮箱：a@b.co\n\nA 2020.1 - 2021.1\n'
  const result = lintResume(text)
  assert.equal(result.ok, true)
  assert.ok(result.findings.some(finding => finding.rule === 'education-missing'))
})

test('contact-missing is an error', () => {
  const text = '# r\n\nA 2020.1 - 2021.1\n'
  const result = lintResume(text)
  assert.ok(result.findings.some(finding => finding.rule === 'contact-missing'))
})
