// An onboarding doc is decidable: what you must install first, a command you
// can paste, what success looks like, where to ask when it fails — and how long
// it takes, because a doc with no time estimate does not get started. That last
// rule is why this package exists.

export const name = 'onboarding-check'
export const inject = ['webServer']

const PREREQ_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:前置|准备|依赖|要求|prerequisit|requirement|before you start|what you need)/i
const PREREQ_LINE = /^[^\n]*(?:需要先|先安装|前置条件[：:，\s]|要求[：:，\s]|prerequisites?[：:\s])/i
const SUCCESS_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:成功|预期|完成后|验证|输出|示例|输出示例|you should see|expected|success|verify|output|example|demo|what you get)/i
const SUCCESS_LINE = /^[^\n]*(?:应该看到|你会看到|成功后|完成后|you should see|expected output)/i
const HELP_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:求助|帮助|联系|遇到问题|getting help|troubleshoot|support)/i
const HELP_LINE = /(?:提 issue|开 issue|联系我们|加群|在 \S* 提问|ask (?:in|on)|open an issue|file an issue)/i
// A time estimate: 5 分钟、约 15 分钟、under 10 minutes、1 小时.
const TIME_ESTIMATE = /\d+\s*(?:分钟|分|小时|minutes?|mins?|hours?|hrs?)|\bhalf an hour\b|半小时/i
// A pasteable command: a fenced block containing an install-ish command.
const FENCE = /```[\s\S]*?```/g
const COMMAND_HINT = /\b(?:npm|pnpm|yarn|npx|pip|pipx|uv|brew|apt|apt-get|dnf|cargo|go install|git clone|curl|docker run|make)\b/

// Prose only: fenced blocks and table rows are not the document speaking.
// Without this, a README passes `prereq-missing` because its own example output
// quotes the sentence "认得：## 前置条件、需要先…" — the check reads a rule's
// message as if it were the reader's prerequisites. Same for the rules table:
// "no 前置条件 section" is one space away from being a prerequisites line.
export function proseOnly(text) {
  const withoutFences = String(text).replace(FENCE, blank => blank.replace(/[^\n]/g, ' '))
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

  // Prerequisites: what must already be installed.
  const hasPrereq = prose.some(line => PREREQ_HEADING.test(`\n${line}`)) || prose.some(line => PREREQ_LINE.test(line))
  if (!hasPrereq) add('error', 'prereq-missing', 0, '没有前置要求段（认得：## 前置要求、需要先装…、Prerequisites）——新人会卡在第 3 步才发现版本不对')

  // A pasteable command: the thing onboarding is actually for.
  const blocks = codeBlocks(text)
  const commandBlocks = blocks.filter(block => block.hasCommand)
  if (commandBlocks.length === 0) {
    add('error', 'command-missing', 0, '没有可粘贴的命令代码块（认得：含 npm/pnpm/npx/pip/git clone/docker run 的 ``` 块）——没有命令的上手文档只能读，不能做')
  }

  // Success: what the reader should see when it worked.
  const hasSuccess = prose.some(line => SUCCESS_HEADING.test(`\n${line}`)) || prose.some(line => SUCCESS_LINE.test(line))
  if (!hasSuccess) add('error', 'success-missing', 0, '没有「成功长什么样」段（认得：## 你应该看到、## 输出示例、You should see）——没有预期输出的新人不知道自己是成功了还是静默失败了')

  // Help: where to go when it fails.
  if (!prose.some(line => HELP_HEADING.test(`\n${line}`)) && !HELP_LINE.test(proseOnly(text))) {
    add('warn', 'help-missing', 0, '没有求助路径（认得：## 遇到问题、提 issue、ask in…）——失败时读者只有放弃这一个选项')
  }

  // Time: the rule that earns the package.
  if (requireTime && !TIME_ESTIMATE.test(text)) {
    add('warn', 'time-estimate-missing', 0, '没有耗时估计（认得：约 5 分钟、15 分钟、under 10 minutes）——没写要花多久的文档不会被开始，读者无法判断值不值得现在做')
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked: { blocks: blocks.length, commandBlocks: commandBlocks.length, lines: lines.length },
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
      const text = typeof body.text === 'string' && body.text ? body.text : body.path ? (await import('node:fs/promises')).readFile(body.path, 'utf8') : ''
      if (!text) return send(400, { error: 'text or path is required' })
      return send(200, lintOnboarding(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
