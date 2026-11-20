import test from 'node:test'
import assert from 'node:assert/strict'
import { lintContributing, delegationTarget, hasTitle, commandLines } from '../src/index.js'

const good = `# Contributing to widget

Thanks for helping out.

## Development setup

1. \`git clone https://github.com/example/widget\`
2. \`pnpm install\`

## Running tests

\`pnpm test\` runs the unit suite.

## Submitting a pull request

Open a PR against \`main\` and describe the change.

## Code style

Prettier formats on commit; do not hand-format.

## Where to ask

Join the Discord or open a discussion.

## Commit messages

We follow Conventional Commits.

## License

Contributions are under the MIT license; no CLA.
`

const bad = `# Contributing

Thanks for your interest. Please be nice.
`

test('一份齐全的指南零发现', () => {
  const result = lintContributing(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.ok, true)
})

test('只有一句客气的文档，四处 error 加四处 warn', () => {
  const result = lintContributing(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(f => f.rule)
  for (const rule of ['setup-missing', 'test-missing', 'pr-missing']) {
    assert.ok(rules.includes(rule), `${rule} 没报：${rules.join(',')}`)
  }
  for (const rule of ['style-missing', 'questions-missing', 'commit-missing', 'license-missing']) {
    assert.ok(rules.includes(rule), `${rule} 没报：${rules.join(',')}`)
  }
})

// 本包存在的理由：有测试一节，却没有一条能跑的命令。
test('有测试段但没有命令 → test-command-missing（而不是 test-missing）', () => {
  const text = good.replace('`pnpm test` runs the unit suite.', '请确保所有测试通过。')
  const result = lintContributing(text)
  const rules = result.findings.map(f => f.rule)
  assert.ok(rules.includes('test-command-missing'), rules.join(','))
  assert.ok(!rules.includes('test-missing'), rules.join(','))
})

// 真实语料（vite）：命令被反引号包在句子中间，也要算有命令。
test('句子中间的 `pnpm test` 也算可执行命令', () => {
  const text = good.replace('`pnpm test` runs the unit suite.', '默认情况下 `pnpm test` 会跑完两套集成测试。')
  assert.ok(!lintContributing(text).findings.some(f => f.rule === 'test-command-missing'))
})

// 真实语料（vite）：明说风格自动处理，就是答案。
test('「不用操心风格，提交时自动格式化」算风格说明', () => {
  const text = good.replace('## Code style\n\nPrettier formats on commit; do not hand-format.\n', 'No need to worry about code style as long as the dev dependencies are installed.\n')
  assert.ok(!lintContributing(text).findings.some(f => f.rule === 'style-missing'))
})

// 真实语料（k8s / django / rust / node）：指路型文档只该得到一条 warn。
test('指路型文档给一条 pointer-guide，不再逐节判', () => {
  const pointer = `# Contributing\n\nWelcome! To learn more, read the [Contributor's Guide](https://example.com/community/contributors/guide/).\n`
  const result = lintContributing(pointer)
  const rules = result.findings.map(f => f.rule)
  assert.deepEqual(rules, ['pointer-guide'])
  assert.ok(delegationTarget(pointer), '应解析出目标')
  assert.equal(result.checked.pointer, true)
})

test('自己能跑起来的文档不会被当成指路型（vite 那种：有命令 + 也有外链）', () => {
  const text = `${good}\nSee also [our community guide](https://example.com/community/).\n`
  const result = lintContributing(text)
  assert.ok(!result.findings.some(f => f.rule === 'pointer-guide'), 'self-contained 不该判成指路型')
})

test('RST 下划线标题也算标题（CONTRIBUTING.rst）', () => {
  const rst = '======================\nContributing to Project\n======================\n\n## Running tests\n\n`make test`\n'
  assert.equal(hasTitle(rst), true)
  assert.ok(!lintContributing(rst).findings.some(f => f.rule === 'title-missing'))
})

test('commandLines 只数真命令，不数散文', () => {
  assert.ok(commandLines(good).length >= 2)
  assert.equal(commandLines('我们认为应当运行测试。').length, 0)
})