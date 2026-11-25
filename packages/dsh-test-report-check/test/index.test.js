import test from 'node:test'
import assert from 'node:assert/strict'
import { lintTestReport, readCounts, genreOf } from '../src/index.js'

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
  // review 模式只有「算术不平」是 error；缺计数/缺环境是 warn。所以要 error 用 strict。
  const result = lintTestReport(bad, { strict: true })
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => finding.rule)
  assert.ok(rules.includes('counts-missing'))
  assert.ok(rules.includes('env-missing'))
})

test('the arithmetic is checked: 12 + 1 + 0 must equal 13', () => {
  const broken = '# r\n\n环境：macOS\n\n通过 12，失败 1，跳过 0，总计 15\n\n失败详情：x\n'
  const result = lintTestReport(broken, { strict: true })
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

test('a failing count without a failure section is an error in strict, a warn in review', () => {
  const text = '# r\n\n环境：macOS\n\n通过 10，失败 2，跳过 0，总计 12\n'
  const review = lintTestReport(text)
  assert.ok(review.findings.some(finding => finding.rule === 'failure-detail-missing' && finding.level === 'warn'))
  const strict = lintTestReport(text, { strict: true })
  assert.ok(strict.findings.some(finding => finding.rule === 'failure-detail-missing' && finding.level === 'error'))
})

test('counts without a total is a warn, total without parts is a warn', () => {
  const partial = '# r\n\n环境：macOS\n\n通过 8，失败 0\n\n失败详情：无\n'
  assert.ok(lintTestReport(partial).findings.some(finding => finding.rule === 'total-missing' && finding.level === 'warn'))
  const onlyTotal = '# r\n\n环境：macOS\n\n总计 8\n'
  assert.ok(lintTestReport(onlyTotal).findings.some(finding => finding.rule === 'counts-partial' && finding.level === 'warn'))
})

// 文件名双关第三次：loadtest-report.md / perf-report.md 里写的是 p50/p95、QPS、并发，
// 没有通过/失败计数。拿测试报告的规则判它，等于问压测报告「你过了几条用例」。
test('性能报告只得到一条 performance-report warn，并指向专门的那个检查', () => {
  const text = '# F036 压测报告\n\n20 并发 × 6 轮\n\n| 配置 | p50 | p95 |\n|---|---|---|\n| 优化后 | 0.338s | 0.587s |\n'
  const result = lintTestReport(text)
  assert.deepEqual(result.findings.map(f => f.rule), ['performance-report'])
  assert.equal(result.ok, true)
})

test('真测试报告不会被误判成性能报告', () => {
  const text = '# 测试报告\n\n通过 12，失败 3，跳过 1，总计 16。\n\n## 测试环境\n\nNode v22\n'
  assert.ok(!lintTestReport(text).findings.some(f => f.rule === 'performance-report'))
})

// 文件名 `TEST-REPORT.md` 在真实世界至少覆盖四种文档。23 份真实文档（GitHub code
// search filename:TEST-REPORT.md 抽 30 份）跑旧判据只有 22% 通过：18 份被判
// 「没有用例计数」，而它们是渗透测试报告和试玩报告——那些文档没有通过/失败这回事。
test('体裁判定：渗透 / 试玩 / 性能 / 用例统计 / 压根不是测试报告', () => {
  const security = `# Web 渗透测试报告\n\n## 范围\n\nexample.com\n\n## 方法\n\nnmap + 手工\n\n## 发现\n\n严重：SQL 注入\n\n## 修复建议\n\n参数化查询\n`
  assert.equal(genreOf(security), 'security')
  assert.deepEqual(lintTestReport(security).findings, [])

  const playtest = `# 试玩报告\n\n## 目的\n\n验证新手引导\n\n## 过程\n\n游玩 40 分钟，前三关\n\n## 发现\n\n第二关提示不清\n\n## 结论\n\n改提示\n`
  assert.equal(genreOf(playtest), 'playtest')
  assert.deepEqual(lintTestReport(playtest).findings, [])

  const other = `# Latest Sync Report\n\n同步了 12 条记录，均成功。\n`
  assert.equal(genreOf(other), 'other')
  const otherResult = lintTestReport(other)
  assert.deepEqual(otherResult.findings.map(finding => finding.rule), ['not-a-test-report'])
  assert.equal(otherResult.ok, true)
})

test('渗透报告缺修复建议：review 是 warn，strict 是 error', () => {
  const thin = `# 渗透测试报告\n\n## 范围\n\nexample.com\n\n## 方法\n\nnmap\n\n## 发现\n\n严重：SQL 注入\n`
  const review = lintTestReport(thin)
  assert.ok(review.findings.some(finding => finding.rule === 'remediation-missing' && finding.level === 'warn'))
  assert.equal(review.ok, true)
  const strict = lintTestReport(thin, { strict: true })
  assert.equal(strict.ok, false)
  assert.ok(strict.findings.some(finding => finding.rule === 'remediation-missing' && finding.level === 'error'))
})

test('只有通过/失败计数的短报告仍是测试报告，不会被判成「不是测试报告」', () => {
  const terse = `# r\n\n环境：macOS\n\n通过 10，失败 2，跳过 0，总计 12\n\n失败详情：x\n`
  assert.equal(genreOf(terse), 'counts')
  const result = lintTestReport(terse, { strict: true })
  assert.ok(!result.findings.some(finding => finding.rule === 'not-a-test-report'))
})
