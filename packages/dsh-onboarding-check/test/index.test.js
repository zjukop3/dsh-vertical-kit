import test from 'node:test'
import assert from 'node:assert/strict'
import { lintOnboarding, codeBlocks } from '../src/index.js'

const good = `# 上手（约 10 分钟）

## 前置要求

- Node 22.19 或更高
- 一个可用的 npm 账号

## 安装

\`\`\`bash
npm install -g dsh-review-outbox
review-outbox --version
\`\`\`

## 你应该看到

\`\`\`text
0.1.11
\`\`\`

装好后打开 DSH，插件页应出现 Review Outbox。

## 遇到问题

版本不对或装不上，请提 issue：https://github.com/zjukop3/dsh-review-outbox/issues
`

const bad = `# 上手

这个项目挺好用的，大家可以看看。
`

test('a complete onboarding doc passes', () => {
  const result = lintOnboarding(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.commandBlocks, 1)
})

test('every defect class is reported', () => {
  const result = lintOnboarding(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => finding.rule)
  assert.ok(rules.includes('prereq-missing'))
  assert.ok(rules.includes('command-missing'))
  assert.ok(rules.includes('success-missing'))
  assert.ok(rules.includes('help-missing'))
  assert.ok(rules.includes('time-estimate-missing'))
})

test('codeBlocks marks only blocks carrying an install-ish command', () => {
  const text = '```bash\nnpm i x\n```\n\n```text\n0.1.11\n```\n'
  const blocks = codeBlocks(text)
  assert.equal(blocks.length, 2)
  assert.deepEqual(blocks.map(block => block.hasCommand), [true, false])
})

test('the time estimate rule fires only when no duration appears anywhere', () => {
  const withoutTime = good.replace('（约 10 分钟）', '')
  assert.ok(lintOnboarding(withoutTime).findings.some(finding => finding.rule === 'time-estimate-missing'))
  assert.ok(!lintOnboarding(good).findings.some(finding => finding.rule === 'time-estimate-missing'))
})

test('the time requirement is configurable away', () => {
  const withoutTime = good.replace('（约 10 分钟）', '')
  assert.ok(!lintOnboarding(withoutTime, { requireTime: false }).findings.some(finding => finding.rule === 'time-estimate-missing'))
})

test('help-missing is a warn, not an error', () => {
  const noHelp = good.replace(/## 遇到问题[\s\S]*$/, '')
  const result = lintOnboarding(noHelp)
  assert.ok(result.findings.some(finding => finding.rule === 'help-missing' && finding.level === 'warn'))
  assert.equal(result.ok, true)
})

test('several time shapes are recognized', () => {
  for (const phrase of ['5 分钟', '约 15 分钟', 'under 10 minutes', '1 小时', '半小时', '30 mins']) {
    const text = good.replace('（约 10 分钟）', `（${phrase}）`)
    assert.ok(!lintOnboarding(text).findings.some(finding => finding.rule === 'time-estimate-missing'), phrase)
  }
})

test('an empty document is one empty error', () => {
  const result = lintOnboarding('  \n')
  assert.equal(result.ok, false)
  assert.equal(result.findings[0].rule, 'empty')
})
