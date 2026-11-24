// An onboarding doc is decidable: what you must install first, a command you
// can paste, what success looks like, where to ask when it fails — and how long
// it takes, because a doc with no time estimate does not get started. That last
// rule is why this package exists.

export const name = 'onboarding-check'
export const inject = ['webServer']

const PREREQ_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:前置|准备|依赖|要求|prerequisit|requirement|before you start|what you need)/i
const PREREQ_LINE = /^[^\n]*(?:需要先|先安装|前置条件[：:，\s]|要求[：:，\s]|prerequisites?[：:\s])/i
const SUCCESS_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:成功|预期|完成后|验证|输出|示例|输出示例|you should see|expected|success|verify|output|example|demo|what you get)/i
const SUCCESS_LINE = /^[^\n]*(?:应该看到|你会看到|成功后|完成后|即成功|表示成功|说明成功|便成功|you should see|expected output)/i
const HELP_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:求助|帮助|联系|遇到问题|getting help|troubleshoot|support)/i
const HELP_LINE = /(?:提 issue|开 issue|联系我们|加群|在 \S* 提问|ask (?:in|on)|open an issue|file an issue)/i
// A time estimate: 5 分钟、约 15 分钟、under 10 minutes、1 小时.
// 判据是「这里有没有给时长」，不是「有没有用分钟这个单位」。第一版只认分钟/小时，
// 于是「37 seconds」「约 40 秒」这种真实、可测的估计被判成没写——我自己的套件 README
// 写了实测 37 秒，dogfood 闸立刻就红了。
const TIME_ESTIMATE =
  /\d+\s*(?:秒|分钟|分|小时|seconds?|secs?|minutes?|mins?|hours?|hrs?)|\bhalf an hour\b|半小时/i
// 第三种文档：**索引页**（DSH 的 user/index.md：一张表，每行指向一份指南）。
export function isIndexPage(text) {
  const source = String(text)
  const links = (source.match(/\]\([^)]*\.md\)/g) ?? []).length
  const fences = (source.match(/^```/gm) ?? []).length
  return links >= 10 && fences === 0
}

// 第四种：**跳转存根**（DSH 的 user/index.md：frontmatter 里一个 meta refresh，
// 正文六行）。它不是文档，是一个指针——对它判上手规则没有意义。
export function isRedirectStub(text) {
  return /http-equiv:\s*refresh|url=\.\/\S+/i.test(String(text))
}

// 第二种文档：**任务型指南**（「在这台已经装好的机器上把一件事做完」）。
// DSH 的 user/guide/ 21 份就是这种：卸载 Desktop、配置代理、从 webhook 建 Session。
// 它们不写「前置要求/你该看到什么/多久跑完/去哪儿求助」，因为它们假设读者已经在用。
// 判据：有编号步骤、且没有安装命令——安装命令是「第一次装」的信号。
// 编号步骤有两种真实形态：列表项 `1. …`，以及编号小节 `## 1. …`。DSH 的 user/guide
// 与 uninstall 文档用后者——第一版只认列表项，于是 21 份任务型指南全被当成上手文档判。
const NUMBERED_STEP = /^(?:\s*\d+\s*[.、)）]\s+\S|#{1,6}\s*\d+\s*[.、)）]\s+\S)/

// 「有没有安装命令」才是分界：安装命令是「第一次把它装上」的信号，任务型指南假设
// 读者已经装好，只会出现 curl/systemctl/配置文件这类东西。
const INSTALL_HINT = /\b(?:npm (?:i|install)|pnpm (?:add|install)|yarn add|pip install|pipx install|brew install|apt(?:-get)? install|cargo install|go install|dsh plugin(?:\s+--profile\s+\S+)?\s+add|npx create)\b/i

export function isTaskGuide(text) {
  const source = String(text)
  if (INSTALL_HINT.test(source)) return false
  const steps = source.split('\n').filter(line => NUMBERED_STEP.test(line)).length
  const sections = (source.match(/^##\s+\S/gm) ?? []).length
  // 至少两条编号步骤、三个以上小节，或者成段的「照这句话发给 agent」引用块——
  // 三种都是「把一件事做完」的形状。一份两句话的便条不算指南。
  const prompts = (source.match(/^>\s+\S/gm) ?? []).length
  return steps >= 2 || sections >= 3 || prompts >= 1
}

// A pasteable command: a fenced block containing an install-ish command.
const FENCE = /```[\s\S]*?```/g
// `dsh` belongs at the front of this list: it is the primary way a plugin is
// installed in the ecosystem this tool exists for. It was missing, so a README
// whose one pasteable line was `dsh plugin add dsh-bot` was reported as having
// no command at all — 216 files in the ecosystem use that form. A tool for DSH
// that does not recognise `dsh` is measuring its own vocabulary.
const COMMAND_HINT = /\b(?:dsh|npm|pnpm|yarn|npx|pip|pipx|uv|brew|apt|apt-get|dnf|cargo|go install|git clone|curl|docker run|make)\b/

// Prose only: fenced blocks and table rows are not the document speaking.
// Without this, a README passes `prereq-missing` because its own example output
// quotes the sentence "认得：## 前置条件、需要先…" — the check reads a rule's
// message as if it were the reader's prerequisites. Same for the rules table:
// "no 前置条件 section" is one space away from being a prerequisites line.
// Our own output has a recognisable shape: a level, a rule name, and `第N行`.
// Only blocks that look like that are masked. The earlier version masked every
// fence, which threw away what real READMEs actually say inside install blocks —
// one third-party README puts its success cue in a shell comment:
// `# 重启 dsh web，侧边栏底部出现"待办"区块即成功`. That is the author speaking,
// not the document quoting this check.
const OWN_OUTPUT = /(?:error|warn)\s+[a-z][a-z0-9-]+\s+第\d+行|认得：##/

export function proseOnly(text) {
  const withoutFences = String(text).replace(FENCE, block => (OWN_OUTPUT.test(block) ? block.replace(/[^\n]/g, ' ') : block))
  return withoutFences
    .split('\n')
    .map(line => (/^\s*\|/.test(line) ? '' : line))
    .join('\n')
}

export function codeBlocks(text) {
  return [...String(text).matchAll(FENCE)].map(match => {
    const body = match[0].replace(/^```[^\n]*\n?/, '').replace(/```$/, '')
    const line = String(text).slice(0, match.index).split('\n').length
    return { line, body, hasCommand: COMMAND_HINT.test(body) }
  })
}

export function lintOnboarding(text, rules = {}) {
  const strict = rules.strict ?? false
  const requireTime = rules.requireTime ?? true
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = String(text).split('\n')
  // Everything structural is judged on prose; the command check below still
  // reads the real text, because that is the one rule about code.
  const prose = proseOnly(text).split('\n')

  if (String(text).trim() === '') {
    return { ok: false, checked: { blocks: 0 }, errors: 1, warnings: 0, findings: [{ level: 'error', rule: 'empty', line: 0, message: '文档是空的' }] }
  }

  if (isRedirectStub(text)) {
    add('warn', 'pointer-guide', 1, '这是一份跳转存根（meta refresh），不是文档——读者被送去的那份才是要判的')
    return finishOnboarding(findings, { blocks: 0, genre: 'redirect' })
  }

  if (isIndexPage(text)) {
    add('warn', 'pointer-guide', 1, `这像是一份索引页（链到 ${(String(text).match(/\]\([^)]*\.md\)/g) ?? []).length} 份文档），不是一份上手文档——逐份看它指向的那份`)
    return finishOnboarding(findings, { blocks: 0, genre: 'index' })
  }

  const earlyBlocks = codeBlocks(text).length
  if (isTaskGuide(text)) {
    // 任务型指南：只问「步骤在不在」「做完怎么知道成了」。
    const steps = String(text).split('\n').filter(line => NUMBERED_STEP.test(line)).length
    if (!/^#\s+\S/m.test(String(text))) add('error', 'title-missing', 1, '没有标题——任务型指南的标题要写出这件任务本身')
    // 任务型指南的体裁判据已经是「至少两步」，所以这里的两步不算薄；只有 0–1 步
    // （靠小节数或引用块进来的）才提醒。第一版写成 <3，把刚够格的文档判成步骤太少。
    if (steps < 2) add('warn', 'steps-thin', 1, `只有 ${steps} 步——任务型指南要能被照着做完`)
    // 英文分支带 \b，中文分支不带：`确认：` 的冒号不是 ASCII 词字符，带 \b 就永远不匹配。
    if (!/\b(?:confirm|verify|check that|should see|you should)\b|(?:即成功|说明成功|确认|验证)/i.test(String(text))) {
      add('warn', 'verify-missing', 0, '没有「怎么知道成了」的一句（认得：confirm、verify、确认、即成功）——做完无法自检')
    }
    return finishOnboarding(findings, { blocks: earlyBlocks, genre: 'task-guide', steps })
  }

  // Prerequisites: what must already be installed.
  const hasPrereq = prose.some(line => PREREQ_HEADING.test(`\n${line}`)) || prose.some(line => PREREQ_LINE.test(line))
  // 实测 37 份真实生态 README：prereq-missing 23/37（62%）。这些文档本身能用——
  // error 只该留给「照着做不了」的那一类（没有可粘贴命令）。所以默认 warn，
  // --strict 时才升级。success-missing 同理（22/37）。
  if (!hasPrereq) {
    add(strict ? 'error' : 'warn', 'prereq-missing', 0, '没有前置要求段（认得：## 前置要求、需要先装…、Prerequisites）——新人会卡在第 3 步才发现版本不对')
  }

  // A pasteable command: the thing onboarding is actually for.
  const blocks = codeBlocks(text)
  const commandBlocks = blocks.filter(block => block.hasCommand)
  if (commandBlocks.length === 0) {
    add('error', 'command-missing', 0, '没有可粘贴的命令代码块（认得：含 npm/pnpm/npx/pip/git clone/docker run 的 ``` 块）——没有命令的上手文档只能读，不能做')
  }

  // Success: what the reader should see when it worked.
  const hasSuccess = prose.some(line => SUCCESS_HEADING.test(`\n${line}`)) || prose.some(line => SUCCESS_LINE.test(line))
  if (!hasSuccess) {
    add(strict ? 'error' : 'warn', 'success-missing', 0, '没有「成功长什么样」段（认得：## 你应该看到、## 输出示例、You should see）——没有预期输出的新人不知道自己是成功了还是静默失败了')
  }

  // Help: where to go when it fails.
  if (!prose.some(line => HELP_HEADING.test(`\n${line}`)) && !HELP_LINE.test(proseOnly(text))) {
    add('warn', 'help-missing', 0, '没有求助路径（认得：## 遇到问题、提 issue、ask in…）——失败时读者只有放弃这一个选项')
  }

  // Time: the rule that earns the package.
  if (requireTime && !TIME_ESTIMATE.test(text)) {
    add('warn', 'time-estimate-missing', 0, '没有耗时估计（认得：约 5 分钟、37 秒、15 分钟、under 10 minutes、40 seconds）——没写要花多久的文档不会被开始，读者无法判断值不值得现在做')
  }

  return finishOnboarding(findings, { blocks: blocks.length, commandBlocks: commandBlocks.length, lines: lines.length, genre: 'onboarding' })
}

function finishOnboarding(findings, checked) {
  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked,
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/onboarding-check/api'
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
      const text = typeof body.text === 'string' && body.text ? body.text : body.path ? await (await import('node:fs/promises')).readFile(body.path, 'utf8') : ''
      if (!text) return send(400, { error: 'text or path is required' })
      return send(200, lintOnboarding(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
