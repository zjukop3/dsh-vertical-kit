import test from 'node:test'
import assert from 'node:assert/strict'
import { lintOnboarding, codeBlocks, proseOnly } from '../src/index.js'

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

test('a doc that quotes the rule text in a fence does not thereby have prerequisites', () => {
  // The real case: a README showing what this check prints. The example output
  // contains the sentence 「认得：## 前置条件、需要先…」, which the prereq line
  // regex happily matched. The document was passing its own check by quoting
  // the check. Fenced blocks are not the document speaking.
  const doc = `# 某检查

## 用法

\`\`\`bash
npm test
\`\`\`

\`\`\`text
error prereq-missing 第0行 没有前置条件段（认得：## 前置条件、需要先…、Prerequisites）
\`\`\`

## 输出示例

\`\`\`text
ok: 0 errors
\`\`\`

跑通约 2 分钟。卡住在仓库开 issue。
`
  const result = lintOnboarding(doc)
  assert.ok(result.findings.some(f => f.rule === 'prereq-missing' && f.level === 'error'), 'the fence must not satisfy it')
})

test('a rules table row mentioning the rule name is not a prerequisites line', () => {
  const doc = `# 某检查

## 用法

\`\`\`bash
npm test
\`\`\`

| rule | level | meaning |
| --- | --- | --- |
| \`prereq-missing\` | error | no 前置条件 section — the reader discovers a missing permission |

## 输出示例

\`\`\`text
ok
\`\`\`

跑通约 2 分钟。卡住在仓库开 issue。
`
  const result = lintOnboarding(doc)
  assert.ok(result.findings.some(f => f.rule === 'prereq-missing'), 'a table cell is not a section')
})

test('proseOnly keeps line numbers so findings still point at the right row', () => {
  const text = 'a\n\n```\nfront\n```\n## 前置要求\n'
  const lines = proseOnly(text).split('\n')
  assert.equal(lines.length, text.split('\n').length)
  assert.equal(lines[5], '## 前置要求')
})

test('only this check own output is masked, not every fence', () => {
  // Masking every fence threw away what real READMEs say inside install blocks:
  // one puts its success cue in a shell comment. Only blocks that quote this
  // check's output are hidden.
  const ownOutput = '```text\nerror prereq-missing 第0行 没有前置要求段（认得：## 前置要求）\n```'
  assert.ok(!proseOnly(ownOutput).includes('prereq-missing'), 'our own output is masked')

  const authorSpeaking = '```bash\ndsh plugin add x  # 侧边栏出现「待办」即成功\n```'
  assert.ok(proseOnly(authorSpeaking).includes('即成功'), 'a shell comment is the author speaking')
})

test('a real-output section counts as what success looks like', () => {
  // 「## 真实输入输出」 with the verbatim CLI output is a stronger answer to
  // "what should I see" than a heading that says 你应该看到. Recognise it.
  for (const heading of ['## 输出示例', '## 示例输出', '## Output', '## Example output', '## Demo', '## 真实输入输出']) {
    const doc = `# 上手

## 前置要求

Node.js >= 22.19。

## 用法

\`\`\`bash
npx thing ./
\`\`\`

${heading}

\`\`\`text
ok: 0 errors
\`\`\`

跑通约 2 分钟。出问题在仓库开 issue，ask in the tracker.
`
    const result = lintOnboarding(doc)
    assert.ok(!result.findings.some(f => f.rule === 'success-missing'), heading)
  }
})

test('the platform install command counts as a command', () => {
  // `dsh plugin add <spec>` is how a plugin is installed in this ecosystem, and
  // the command list did not include it. 216 files across the ecosystem use it;
  // a README whose only pasteable line was `dsh plugin add dsh-bot` was reported
  // as having no command.
  for (const command of ['dsh plugin add dsh-bot', 'dsh plugin --profile web add dsh-pet', 'dsh web', 'dsh plugin list']) {
    const doc = `# 插件

## 前置要求

Node.js >= 22.19。

## 安装

\`\`\`bash
${command}
\`\`\`

## 输出示例

\`\`\`text
ok
\`\`\`

约 2 分钟。出问题在仓库开 issue。
`
    const result = lintOnboarding(doc)
    assert.ok(!result.findings.some(f => f.rule === 'command-missing'), command)
  }
})

test('prose that merely mentions dsh is not a command block', () => {
  // The hint only counts inside a fenced block, so a sentence about dsh does not
  // satisfy the rule.
  const doc = `# 插件

## 前置要求

Node.js >= 22.19。

这个插件用于 dsh 的成果审阅。

## 输出示例

\`\`\`text
ok
\`\`\`

约 2 分钟。出问题在仓库开 issue。
`
  assert.ok(lintOnboarding(doc).findings.some(f => f.rule === 'command-missing'))
})
