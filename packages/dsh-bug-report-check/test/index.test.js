import test from 'node:test'
import assert from 'node:assert/strict'
import { lintBugReport, reproSteps, reproEvidence, envEvidence, proseSequence, listItems } from '../src/index.js'

// 这套判据被 404 份真实 GitHub bug issue 校准过（vscode / kibana / pandas / TypeScript /
// deno / home-assistant）。旧版只有 2% 通过：88% 报「没有环境」、86% 报「没有复现步骤」——
// 那不是真实报告都写坏了，是判据在量拼写。下面每一条测试都对应一处被真实文件打回来的假设。

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

test('一份完整的 bug 报告通过，两种模式都通过', () => {
  for (const strict of [false, true]) {
    const result = lintBugReport(good, { strict })
    assert.deepEqual(result.findings, [], `strict=${strict}: ${JSON.stringify(result.findings)}`)
    assert.equal(result.checked.steps, 3)
  }
})

test('几乎没正文的提交在两种模式下都是 error——那不是文风问题，是没法用', () => {
  for (const strict of [false, true]) {
    const result = lintBugReport(bad, { strict })
    assert.equal(result.ok, false)
    const rules = result.findings.map(finding => finding.rule)
    assert.ok(rules.includes('title-missing'))
    assert.ok(rules.includes('repro-missing'))
    assert.equal(result.checked.emptySubmission, true)
  }
})

test('review 模式只对「没法用」判 error，其余是建议；strict 模式全部升级', () => {
  // 一段真实报告的形状：有版本、有描述，没写编号步骤、没写预期/实际对照。
  const text = `# 隐藏的 Helpers 不出现在 HomeKit 配置里

### The problem

在 HomeKit 配置流程里，隐藏的 Helpers 不显示，因此不会推送到 Apple Home。

### What version of Home Assistant Core has the issue?

core-2022.5.0b6
`
  const review = lintBugReport(text)
  assert.equal(review.ok, true, JSON.stringify(review.findings))
  assert.ok(review.findings.every(finding => finding.level === 'warn'))
  const strict = lintBugReport(text, { strict: true })
  assert.equal(strict.ok, false)
  assert.ok(strict.findings.filter(finding => finding.level === 'error').length >= 2)
})

test('加粗标签 `**Steps**` 与行内 `Steps to reproduce:` 都算步骤段名', () => {
  const bold = `# r\n\n**Environment**\n\nvite 5.4.2 on macOS 15\n\n**Steps**\n\n1. 打开页面\n2. 点击按钮\n3. 刷新\n`
  assert.equal(reproSteps(bold).length, 3)
  const inline = `# r\n\nSteps to reproduce:\n\n1. 打开页面\n2. 点击按钮\n`
  assert.equal(reproSteps(inline).length, 2)
})

test('没有段名的一串 bullet 也算步骤', () => {
  const text = `# Closing the dialog also closes the parent dialog\n\n- Open the Remote Environment dialog\n- Select a GitHub Environment entry\n- Close the dialog\n`
  const items = listItems(text)
  assert.equal(items.length, 3)
  assert.equal(reproEvidence(text).kind, 'steps')
})

test('markdown 标题不是 shell 提示符——`# bug` 从来没跑过任何东西', () => {
  // 旧版把 `^#\s` 当成 `$ / >` 那样的提示符，于是任何只有标题的报告都被判「有命令可跑」。
  assert.equal(reproEvidence('# bug\n').kind, 'none')
  assert.equal(reproEvidence('# 崩溃\n\nhttps://example.com\n').kind, 'none')
  assert.equal(reproEvidence('# 跑不起来\n\n执行 `npm test` 就报错。\n').kind, 'command')
})

test('写了先后动作的散文算复现证据，纯描述不算', () => {
  const prose = '打开设置，切换到 Agent 面板，然后关闭所有会话——底部面板会被自动打开。'
  const found = proseSequence(prose)
  assert.ok(found, '两句以上动作词应当算复现')
  assert.equal(reproEvidence(`# r\n\n${prose}\n`).kind, 'prose')
  assert.equal(proseSequence('这个功能不太好用，希望能改进。'), null)
})

test('环境证据接受真实写法：小写词 + 版本号、commit、Platform 标签、表单字段', () => {
  assert.equal(envEvidence('# r\n\nvite 5.4.2 上必现\n').kind, 'version')
  assert.equal(envEvidence('# r\n\nCommit: ade7f1b62fe6890ef4fee08ea5a8ebb0e7c002f8\n').kind, 'commit')
  assert.equal(envEvidence('# r\n\nPlatform: darwin\n\n再往下。\n').kind, 'label')
  assert.equal(envEvidence('# r\n\n只是编号 1.2.3 不算\n').kind, 'none')
})

test('`### The problem` 这种表单式小节不会被当成预期/实际', () => {
  // 形状取自 home-assistant 的真实表单（issue 71246）：段名是问句，值在下一行，
  // 全文没有「预期」「实际」两个词。
  const text = `# 隐藏的 Helpers 不出现在 HomeKit 配置里

### The problem

在 HomeKit 配置流程里，隐藏的 Helpers 不显示，因此不会推送到 Apple Home。已经启用的
Helpers 会出现在配置流程里；之后再隐藏它们，Apple Home 里仍然留着。改一次配置流程，
它们又变回隐藏。

### What version of Home Assistant Core has the issue?

core-2022.5.0b6

### What was the last working version of Home Assistant Core?

core-2022.4.7
`
  const result = lintBugReport(text)
  assert.equal(result.checked.env, 'version')
  assert.equal(result.ok, true, JSON.stringify(result.findings))
  // 这一段有「之后再…」这样的先后关系，算散文式复现；仍然缺预期/实际的对照。
  assert.equal(result.checked.repro, 'prose')
  assert.deepEqual(result.findings.map(finding => finding.rule + ':' + finding.level), ['expectation-unstated:warn'])
  assert.equal(result.checked.expectedActual, 'none')
})

test('repro-thin 只在真有步骤时出现，下限可配', () => {
  const text = '# r\n\n## 环境\n\n- 版本：1.0\n\n## 复现步骤\n\n1. 试试看\n\n## 预期\n\n预期正常。\n\n## 实际\n\n实际报错。\n'
  const result = lintBugReport(text)
  assert.ok(result.findings.some(finding => finding.rule === 'repro-thin'))
  const relaxed = lintBugReport(text, { minSteps: 1 })
  assert.ok(!relaxed.findings.some(finding => finding.rule === 'repro-thin'))
})

test('有预期没实际、有实际没预期，各自被点名', () => {
  const expectedOnly = '# r\n\n## 环境\n\n- 版本：1.0\n\n## 复现步骤\n\n1. 打开页面\n2. 点击按钮\n3. 看结果\n\n## 预期\n\n预期正常。\n'
  const a = lintBugReport(expectedOnly, { strict: true })
  assert.ok(a.findings.some(finding => finding.rule === 'actual-missing' && finding.level === 'error'), JSON.stringify(a.findings))
  const actualOnly = expectedOnly.replace('## 预期', '## 实际')
  const b = lintBugReport(actualOnly, { strict: true })
  assert.ok(b.findings.some(finding => finding.rule === 'expected-missing' && finding.level === 'error'), JSON.stringify(b.findings))
})

test('checked 里说清判据看到的是什么，不是一个笼统的 ok', () => {
  const result = lintBugReport(good)
  assert.equal(result.checked.repro, 'steps')
  assert.equal(result.checked.env, 'label')
  assert.equal(result.checked.expectedActual, 'pair')
  assert.equal(result.mode, 'review')
  assert.equal(lintBugReport(good, { strict: true }).mode, 'strict')
})

test('写全预期与实际之后，expectation-unstated 不会出现（strict 下也一样）', () => {
  // 这条是「沉默方向」：规则名在，但好文档上它一声不出。规则审计要求每条规则
  // 两个方向都被测到过——只见过它报，等于不知道它什么时候不报。
  const strict = lintBugReport(good, { strict: true })
  assert.equal(strict.errors, 0)
  assert.ok(!strict.findings.some(finding => finding.rule === 'expectation-unstated'))
})
