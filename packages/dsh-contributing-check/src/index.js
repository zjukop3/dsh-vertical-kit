// A CONTRIBUTING guide is read by someone who has just decided to spend their
// evening on your project. Four things decide whether they finish: how to get a
// working environment, how to run the tests, what a pull request is expected to
// look like, and what style the code is held to. Three more decide whether they
// come back: where to ask, how commits are expected to read, and whether a CLA
// or DCO will be sprung on them at review time.
//
// The test command is the rule this package exists for. Every guide says "run
// the tests"; the ones that work say `npm test` or `make test`. A guide without
// a runnable command leaves the contributor to guess, and a guessed test
// invocation is how a first PR arrives red.

export const name = 'contributing-check'
export const inject = ['webServer']

// 标题：markdown 的 `# x`，或 RST 的下划线式（CONTRIBUTING.rst 在 Django、CPython、
// Salt 这些项目里都是这个形状）。
export function hasTitle(text) {
  const lines = String(text).split('\n')
  if (lines.some(line => /^#\s+\S/.test(line))) return true
  return lines.some((line, index) => /^[=-]{3,}\s*$/.test(line) && (lines[index - 1] ?? '').trim().length > 0)
}

const heading = words => new RegExp(`(?:^|\\n)#{1,6}[^\\n]*(?:${words})`, 'i')
const label = words => new RegExp(`^[^\\n]*(?:${words})\\s*[：:]`, 'i')

export const SETUP_HEADING = heading(
  '开发环境|环境准备|本地开发|安装|搭建|getting started|development setup|dev setup|setup|install|building|build from source|local development|prerequisites',
)
// 命令可能在行首、在列表项里、也可能像 vite 那样被反引号包在句子中间
// （「Run `pnpm i` in Vite's root folder」）。判据是「有没有这条命令」，
// 不是「它站在哪里」——按行首锚定会把最典型的真实写法判成没有命令。
export const SETUP_COMMAND =
  /(?:^|[\s`'"\[(])(?:git clone|npm (?:ci|install)|pnpm (?:i|install|add)|yarn (?:install|add)|pip install|poetry install|cargo build|go mod download|make (?:setup|install|bootstrap|build)|bundle install)\b/

export const TEST_HEADING = heading('测试|跑测试|单元测试|test(?:s|ing)?|running tests|how to test')
// 一条命令，而不是「请确保测试通过」这种叮嘱。
export const TEST_COMMAND =
  /(?:^|[\s`'"\[(])(?:npm (?:run )?test|pnpm (?:run )?test|yarn test|npx (?:jest|vitest|mocha|playwright)|cargo test|go test|pytest|tox|make (?:test|check)|ctest|mix test|dotnet test)\b/

export const PR_HEADING = heading(
  'pull request|PR|提交|贡献流程|工作流|workflow|submitting|how to contribute|contributing code|changes',
)
export const STYLE_HEADING = heading('代码风格|风格|格式化|规范|lint|style|format|conventions')
// 真实写法：vite 的指南说「不用操心代码风格，装好依赖后提交时自动格式化」。这就是答案。
export const STYLE_AUTO = /(?:no need to (?:worry|think) about (?:the )?(?:code )?style|automatically formatted|auto-?format|format(?:ted)? (?:on|at) commit|prettier|oxfmt|eslint --fix|自动格式化|提交时自动)/i
export const QUESTIONS_HEADING = heading('提问|讨论|求助|社区|沟通|questions|asking|discussion|community|chat|support|getting help|where to ask')
export const COMMIT_HEADING = heading('commit|提交信息|提交规范|sign-off|dco|conventional')
export const LICENSE_HEADING = heading('cla|dco|许可证|授权|license|licensing|copyright')

export const QUESTIONS_ANY = /(?:discord|slack|gitter|zulip|matrix|forum|mailing list|discussion|issue tracker|stack overflow|good first issue|提问|讨论区)/i
export const COMMIT_ANY = /(?:conventional commits|commit message|commit 规范|提交信息|signed-off-by|Co-authored-by|git commit -s)/i
export const LICENSE_ANY = /(?:CLA|contributor license agreement|DCO|developer certificate of origin|MIT|Apache-2|BSD|GPL|许可证)/i

/** Runnable commands, wherever they sit — a fence, a list item, or mid-sentence in
 *  backticks. Counting only line-initial commands undercounted the real guides. */
const COMMAND_TOKEN = /(?:^|[\s`'"\[(])(?:npm|pnpm|yarn|npx|make|cargo|go|python|pytest|tox|dotnet|mix|docker|poetry|bundle|ctest|bazel|git|corepack)\b/

export function commandLines(text) {
  return String(text)
    .split('\n')
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter(entry => COMMAND_TOKEN.test(entry.text) && /(?:^|[\s`])(?:-|--|run|install|test|build|clone|i)\b/.test(entry.text.replace(/^[\d.、)\s]+/, '')))
}

// 指路型文档：真实 CONTRIBUTING.md 里有一大类只是把人送去别处（k8s 送社区仓库、
// django 送 docs/internals/contributing/、rust 送 Zulip 与 rustc-dev-guide、node 送
// first-contributions.md）。这种文档本身无法照做，但读者知道该去哪——逐节判它对它
// 不公平。判据是「自己给不出可执行命令，但明确点了目标」。
export const DELEGATION =
  /\[[^\]]{0,80}\]\([^)]*(?:contribut|community|guide|hack|develop|first-time)[^)]*\)|(?:guidelines?|instructions?|guide)[^\n]{0,40}(?:available|located|found|in|at)[^\n]{0,60}(?:contribut|community|docs|guide)|(?:see|read|check out|refer to)[^\n]{0,60}(?:contributor|contributing|community|guide|first-time)/i

export function delegationTarget(text) {
  // 真实文档里这句话常被换行切断（django：guidelines are available in the repository at
  // \n docs/internals/contributing/），所以按「空白合并后的全文」判，不按行判。
  const source = String(text).replace(/\s+/g, ' ')
  const link = source.match(/\[([^\]]{0,80})\]\(([^)]*(?:contribut|community|guide|hack|develop|first-time)[^)]*)\)/i)
  if (link) return link[2]
  const line = source.split('\n').find(entry => DELEGATION.test(entry))
  return line ? line.trim().slice(0, 120) : null
}

export function lintContributing(text, rules = {}) {
  const strict = rules.strict ?? false
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = String(text).split('\n')
  const any = (...patterns) => lines.some(line => patterns.some(pattern => pattern.test(`\n${line}`) || pattern.test(line)))

  if (!hasTitle(text)) add('error', 'title-missing', 1, '没有标题（认得：`# 标题`，或 RST 的下划线标题）——这份文档要有个能认出来的名字')

  // 指路型：自己给不出命令，但点了明确的目标 → 一条 warn，代替六条误报。
  const selfContained = TEST_COMMAND.test(text) || SETUP_COMMAND.test(text)
  const target = delegationTarget(text)
  if (!selfContained && target) {
    add('warn', 'pointer-guide', 0, `这份文档是「指路型」：自己没有可执行命令，但指向 ${target}——本检查只能确认它点了明确去处，目标文档是否齐备要另外跑一次`)
    const order0 = { error: 0, warn: 1 }
    findings.sort((a, b) => order0[a.level] - order0[b.level] || a.line - b.line)
    const errors0 = findings.filter(finding => finding.level === 'error').length
    return {
      ok: errors0 === 0,
      checked: { lines: lines.length, commands: commandLines(text).length, pointer: true, target },
      errors: errors0,
      warnings: findings.length - errors0,
      findings,
    }
  }

  if (!any(SETUP_HEADING) && !SETUP_COMMAND.test(text)) {
    add('error', 'setup-missing', 0, '没有开发环境段（认得：## 开发环境、## Getting started、git clone / npm ci 这类命令）——新人卡在第一步就走了')
  }

  if (!any(TEST_HEADING) && !TEST_COMMAND.test(text)) {
    add('error', 'test-missing', 0, '没有测试段（认得：## 测试、## Running tests）——不知道该跑什么测试的人，交上来的 PR 是红的')
  } else if (!TEST_COMMAND.test(text)) {
    // 有测试这一节，却没给一条能跑的命令。这正是本包存在的理由。
    add('error', 'test-command-missing', 0, '有测试段但没有一条可执行命令（认得：npm test、pytest、cargo test、make test）——「请确保测试通过」不是指令')
  }

  if (!any(PR_HEADING)) {
    add('error', 'pr-missing', 0, '没有提交 PR 的说明（认得：## Pull request、## 贡献流程、## Submitting changes）——不知道你期待什么，第一次 PR 就会踩到你的隐性规矩')
  }

  if (!any(STYLE_HEADING) && !STYLE_AUTO.test(text)) {
    add(strict ? 'error' : 'warn', 'style-missing', 0, '没有代码风格段（认得：## 代码风格、## Lint，或明说提交时自动格式化）——风格要求藏在评审里，等于每次评审重讲一遍')
  }

  if (!any(QUESTIONS_HEADING) && !QUESTIONS_ANY.test(text)) {
    add(strict ? 'error' : 'warn', 'questions-missing', 0, '没有「到哪问」的说明（认得：## 提问、Discord、mailing list、good first issue）——卡住的人只有放弃和硬猜两条路')
  }

  if (!any(COMMIT_HEADING) && !COMMIT_ANY.test(text)) {
    add(strict ? 'error' : 'warn', 'commit-missing', 0, '没有提交信息约定（认得：Conventional Commits、Signed-off-by、DCO）——评审时才发现格式不对，返工的是对方')
  }

  if (!any(LICENSE_HEADING) && !LICENSE_ANY.test(text)) {
    add(strict ? 'error' : 'warn', 'license-missing', 0, '没有许可/CLA/DCO 说明（认得：CLA、DCO、License）——贡献者不知道自己交出去的代码按什么授权')
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked: { lines: lines.length, commands: commandLines(text).length },
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/contributing-check/api'
  const handler = async (req, res) => {
    const send = (status, body) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }
    try {
      if (req.method !== 'POST') return send(405, { error: 'POST only' })
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      const text = typeof body.text === 'string' && body.text ? body.text : body.path ? (await import('node:fs/promises')).readFile(body.path, 'utf8') : ''
      if (!text) return send(400, { error: 'text or path is required' })
      return send(200, lintContributing(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}