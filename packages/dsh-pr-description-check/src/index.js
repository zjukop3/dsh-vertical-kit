// A pull request description is decidable: it says what changed, why, and how
// the author knows it works, links the issue it closes, states any breaking
// change, and does not ship an all-unchecked checklist. This verifies exactly
// those — the reviewer's first three questions.

export const name = 'pr-description-check'
export const inject = ['webServer']

const WHAT_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:概述|变更|这个 pr 做什么|做了什么|what|summary|changes)/i
// Evidence of substance, not of a heading. A description that lists its
// changes in bullets says what it did; one that explains "so the reader can…"
// says why; one that names tests, an audit or a CI result says how it knows.
// Requiring the headings instead reported all nineteen of this project's own
// merged PRs as missing all three — they answer every question in prose.
const WHAT_EVIDENCE = /^\s*(?:[-*+]\s+\S|\d+\.\s+\S)/m
// Narrow on purpose. A bare `because` fires on "because `#` is a non-word
// character" — an explanation inside a body that never states a motivation, which
// is exactly what happened on one of this project's own PRs. Only phrases that
// are unambiguously about motive count.
const WHY_EVIDENCE = /\b(?:the reason (?:is|this)|which is why|this is why|so that|motivations?)\b|动机是|之所以|目的是|为的是/i
const TEST_EVIDENCE = /\b(?:tests?|tested|testing|audit|verified|verify|green|coverage|regression)\b|测试|验证|自测|跑过|回归/i
const FENCE = /```[\s\S]*?```/g
const WHAT_LINE = /^[^\n]*(?:这个 pr|此 pr|本次(?:变更|改动)|变更说明[：:，\s]|概述[：:，\s]|this pr\b|this change\b)/i
const WHY_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:为什么|动机|背景|why|motivation|background|context)/i
const WHY_LINE = /^[^\n]*(?:为什么[：:，\s]|动机[：:，\s]|背景[：:，\s]|因为|原因[：:，\s])/i
const TEST_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:测试|验证|how (?:was this )?tested|testing|verification)/i
const TEST_LINE = /^[^\n]*(?:测试(?:方式|步骤)?[：:，\s]|验证(?:方式)?[：:，\s]|how tested|已测试|手动测试|单元测试)/i
// A closing reference: Fixes #12, Closes #34, refs #56, or a bare issue URL.
// No leading \b on the bare `#\d+` alternative: `#` is a non-word character, so
// " #101" has no word boundary in front of it and `\b#` never matches.
const ISSUE_REF = /(?:\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?|refs?|see)\s*:?\s*#\d+)|(?:#\d+\b)|(?:https?:\/\/\S+\/(?:issues|pull)\/\d+)/i
// A declaration, not a mention. Describing a tool that *detects* breaking
// changes ("breaking changes announced in a BREAKING CHANGE: trailer") is not
// declaring one — that false positive landed on two of this project's own
// merged PRs, both of which were describing a checker.
const BREAKING = /^\s*(?:#{1,6}\s*)?(?:⚠️\s*)?(?:BREAKING[ _-]?CHANGE\b|breaking(?:[ _-]?change)?[：:]|破坏性(?:变更)?[：:]|不兼容(?:变更)?[：:])/im
const MIGRATION = /(?:迁移|升级说明|migration|upgrade (?:guide|note)|how to migrate)/i

// Checklist boxes: `- [ ]` unchecked, `- [x]` checked.
// Fenced blocks are masked before evidence is read: a PR that pastes a stack
// trace, or quotes this check's own output, must not thereby satisfy it.
export function proseOnly(text) {
  return String(text).replace(FENCE, blank => blank.replace(/[^\n]/g, ' '))
}

export function checkboxes(text) {
  const out = []
  String(text).split('\n').forEach((line, index) => {
    const match = line.match(/^\s*[-*+]\s*\[([ xX])\]\s*(.*)$/)
    if (match) out.push({ line: index + 1, checked: match[1].toLowerCase() === 'x', label: match[2].trim() })
  })
  return out
}

// 'warn' (default), 'error', or 'off'. Whether a description states a *reason*
// is not decidable from its keywords — motivation and exposition use the same
// words. So it warns, and a repo that wants it blocking asks for it.
export function whyPolicy(rules = {}) {
  const requested = rules.requireWhy ?? 'warn'
  if (requested === true) return 'error'
  if (requested === false) return 'off'
  return ['warn', 'error', 'off'].includes(requested) ? requested : 'warn'
}

export function lintPrDescription(text, rules = {}) {
  const requireWhy = whyPolicy(rules)
  const requireIssue = rules.requireIssue ?? false
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = String(text).split('\n')

  if (String(text).trim() === '') {
    return { ok: false, checked: { lines: 0 }, errors: 1, warnings: 0, findings: [{ level: 'error', rule: 'empty', line: 0, message: 'PR 描述是空的——reviewer 只能从 diff 猜意图' }] }
  }

  const prose = proseOnly(text)
  const proseLines = prose.split('\n')

  // What changed: the one thing a reviewer reads first. A bullet list counts:
  // listing the changes is the answer, labelled or not.
  const hasWhat = proseLines.some(line => WHAT_HEADING.test(`\n${line}`)) || proseLines.some(line => WHAT_LINE.test(line)) || WHAT_EVIDENCE.test(prose)
  if (!hasWhat) add('error', 'what-missing', 0, '没有「做了什么」段（认得：## 概述、## 变更、这个 PR…、或一条列出改动的列表）——reviewer 只能从 diff 反推意图')

  // Why: the context a diff cannot carry.
  const hasWhy = proseLines.some(line => WHY_HEADING.test(`\n${line}`)) || proseLines.some(line => WHY_LINE.test(line)) || WHY_EVIDENCE.test(prose)
  if (requireWhy !== 'off' && !hasWhy) {
    const why = requireWhy === 'error' ? 'diff 说明改了什么，改不了改的理由' : '这条靠判断不靠关键词，想让它在 CI 里阻断就传 rules.requireWhy: "error"'
    add(requireWhy, 'why-missing', 0, `没有「为什么」段（认得：## 背景、## 动机、the reason is、动机是）——${why}`)
  }

  // How it was verified: the rule that catches "works on my machine".
  const hasTest = proseLines.some(line => TEST_HEADING.test(`\n${line}`)) || proseLines.some(line => TEST_LINE.test(line)) || TEST_EVIDENCE.test(prose)
  if (!hasTest) add('error', 'test-missing', 0, '没有测试/验证说明（认得：## 测试、验证：…、How tested、测试数/audit/CI 结果）——没有验证说明的 PR 让 reviewer 替你验证')

  // Issue link: traceability. A warn by default — small fixes legitimately
  // arrive without one.
  if (requireIssue && !ISSUE_REF.test(text)) {
    add('error', 'issue-missing', 0, '没有关联 issue（认得：Fixes #12、Closes #34、#56）——无法追溯为什么做这件事')
  } else if (!ISSUE_REF.test(text)) {
    add('warn', 'issue-unlinked', 0, '没有关联 issue（认得：Fixes #12、#56）——小改动可以没有，但追溯性会差一些')
  }

  // Breaking change stated, and paired with a migration note.
  if (BREAKING.test(prose) && !MIGRATION.test(prose)) {
    add('error', 'breaking-without-migration', 0, '提到了破坏性变更但没有迁移/升级说明——下游读者被留在原地')
  }

  // All-unchecked checklist: the template was kept, the thinking was not done.
  const boxes = checkboxes(text)
  if (boxes.length > 0 && boxes.every(box => !box.checked)) {
    add('warn', 'checklist-unchecked', boxes[0].line, `有 ${boxes.length} 个检查项但一个都没勾——要么逐项确认，要么删掉这段模板`)
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked: { boxes: boxes.length, lines: lines.length },
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/pr-description-check/api'
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
      return send(200, lintPrDescription(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
