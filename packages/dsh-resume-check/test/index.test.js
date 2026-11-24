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

// 真实语料（6 份名字叫 resume.md / cv.md 的公开文档）：其中 4 份是简历、2 份是
// 「工作续点」（session resume state / Resume Point）。第 5 批那个同款陷阱：
// 文件名双关。另外两份真简历暴露了两处只认词形的问题。
test('有邮箱地址就算有联系方式，不必出现「邮箱」二字', () => {
  const text = '# 王广忠\n\n我的 gmail 账号是 peter1983@gmail.com，github 是 github.com/happypeter。\n\n## 经历\n\n2010 - 2014 在某公司做讲师\n'
  const result = lintResume(text)
  assert.ok(!result.findings.some(f => f.rule === 'contact-missing'), JSON.stringify(result.findings.map(f => f.rule)))
})

test('中文自述里的学历（大学 / 研究生）也算教育信息', () => {
  const text = '# 某人\n\n邮箱：a@b.co\n\n## 经历\n\n2016 至今 某公司\n\n后来上大学就到了石家庄，研究生在北京读的。\n'
  assert.ok(!lintResume(text).findings.some(f => f.rule === 'education-missing'))
})

test('续点文档只得到一条 checkpoint-doc warn', () => {
  const text = '# Session resume state — 2026-07-30, branch `codex/x`\n\n## 2026-08-18 checkpoint\n\n- 修了解析器\n'
  const result = lintResume(text)
  assert.deepEqual(result.findings.map(f => f.rule), ['checkpoint-doc'])
  assert.equal(result.ok, true)
})

test('俄语的续点（Ветка / Статус）也认得', () => {
  const text = '# Точка\n\n**Дата:** 2026-03-02\n**Ветка:** fix/x\n**Статус:** работает\n'
  assert.deepEqual(lintResume(text).findings.map(f => f.rule), ['checkpoint-doc'])
})

test('简历正文里提到 checkpoint 这个词，不会被判成续点', () => {
  const text = '# 张三\n\n邮箱：zhang@example.com\n\n## 经历\n\n2018 - 2021 某安全公司，做过 Checkpoint 防火墙的策略迁移。\n'
  assert.ok(!lintResume(text).findings.some(f => f.rule === 'checkpoint-doc'))
})

// 2026-11-24：用三份真实中文简历（本地私有文件，内容不入仓）校准，撞出三处误报：
// 倒序时间线被按文档顺序比较、项目经历被当成雇佣区间、`项目经历` 后面的 `\b` 让整节匹配不上。
const REVERSED = `# 王五

- 邮箱：wangwu@example.com

## 工作经历

**丙公司** 工程师 2017.7 - 至今
**乙公司** 工程师 2013.11 - 2017.6
**甲公司** 工程师 2012.4 - 2012.9

## 教育经历

某大学 硕士 2012.9 - 2017.3
某大学 本科 2008.9 - 2012.6
`

const PROJECTS = `# 赵六

- 邮箱：zhaoliu@example.com

## 工作经历

**A公司** 2020.1 - 2022.6

## 项目经历

- 项目甲 2021.1-2022.1
- 项目乙 2021.6-2022.3
`

test('倒序时间线：按开始月份排序后比较，正常简历不报重叠', () => {
  const result = lintResume(REVERSED)
  assert.deepEqual(result.findings.filter(finding => finding.rule === 'dates-overlap'), [])
})

test('项目经历天生重叠，不当雇佣区间判', () => {
  const result = lintResume(PROJECTS)
  assert.deepEqual(result.findings.filter(finding => finding.rule === 'dates-overlap'), [])
})

test('真重叠仍然报：同节内、重叠超过 3 个月', () => {
  const overlapping = `# 钱七

- 邮箱：qianqi@example.com

## 工作经历

**A公司** 2020.1 - 2022.6
**B公司** 2021.1 - 2023.1
`
  assert.ok(lintResume(overlapping).findings.some(finding => finding.rule === 'dates-overlap'))
})
