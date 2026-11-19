// A commit message is decidable from its text: a subject that fits in a git log
// line, no trailing period, a blank line before the body, breaking changes
// announced in the body rather than buried in the subject, and — optionally —
// a type prefix from a known set. This verifies exactly those.
//
// Two kinds of rule live here, and they are not the same kind of thing:
//
//   convention-neutral — the subject wraps in git log, the period reads as a
//   truncated sentence, a missing blank line folds the body into the subject,
//   a `!` alone loses the trailer downstream tools parse. Every repo, in every
//   language, is wrong in the same way.
//
//   convention-carrying — `feat:`/`fix:` is the Conventional Commits spec.
//   Plenty of good repos use `Verb noun`, and a Chinese subject has no English
//   type word to offer. Erroring on those is not catching a mistake; it is
//   imposing a house style on a stranger, and the check gets uninstalled on
//   the first commit. So this one warns by default and errors only when the
//   repo asks for it via `requireType: 'error'`.

export const name = 'commit-msg-check'
export const inject = ['webServer']

export const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']

// `type(scope): subject` or `type: subject`. The colon is required; a bare
// sentence with no prefix is the most common violation and the cheapest to fix.
//
// The subject is `.*`, not `.+`, on purpose: with `.+` a header of `feat:` fails
// to parse, so `type` reads as null and the `subject-empty` rule below can never
// fire. It was dead code until the rules audit looked for a test that makes each
// rule fire and found none for this one.
const HEADER = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.*)$/

export function parseCommit(text) {
  const lines = String(text).split('\n')
  const header = lines[0] || ''
  const match = header.match(HEADER)
  const body = lines.slice(1).join('\n')
  return {
    header,
    type: match ? match[1] : null,
    scope: match && match[2] ? match[2] : null,
    bang: match ? match[3] === '!' : false,
    subject: match ? match[4] : header,
    body,
    bodyStartLine: lines.length > 1 ? 2 : 0,
  }
}

// `requireType` is 'warn' (default), 'error', or 'off'. Booleans from 0.1.0
// still work: true meant error, false meant off. Anything unrecognised falls
// back to the default rather than silently disabling a check.
export function typePolicy(rules = {}) {
  const requested = rules.requireType ?? 'warn'
  if (requested === true) return 'error'
  if (requested === false) return 'off'
  return ['warn', 'error', 'off'].includes(requested) ? requested : 'warn'
}

export function lintCommitMessage(text, rules = {}) {
  const maxSubject = rules.maxSubject ?? 72
  const policy = typePolicy(rules)
  const types = rules.types ?? TYPES
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = String(text).split('\n')
  const commit = parseCommit(text)

  if (!commit.header.trim()) {
    return { ok: false, checked: { lines: lines.length }, errors: 1, warnings: 0, findings: [{ level: 'error', rule: 'empty', line: 0, message: '提交信息为空' }] }
  }

  // Type prefix. A warning by default, on purpose — see the note at the top.
  if (commit.type === null) {
    if (policy !== 'off') {
      const why = policy === 'error'
        ? '看不出这次改动的性质'
        : '这条是团队约定，不是 git log 的硬要求——想强制就传 rules.requireType: "error"'
      add(policy, 'type-missing', 1, `第 1 行没有类型前缀（认得：${types.join('/')}）——「${commit.header.slice(0, 30)}」${why}`)
    }
  } else if (!types.includes(commit.type)) {
    add('warn', 'type-unknown', 1, `第 1 行类型「${commit.type}」不在已知集合（${types.join('/')}）——自定义类型可以，但要确认是有意的`)
  }

  // Subject length: 72 is where git log wraps in a standard terminal.
  const length = [...commit.subject].length
  if (length > maxSubject) add('error', 'subject-long', 1, `第 1 行主题 ${length} 字，超过 ${maxSubject}——git log 会折行，细节放正文`)
  if (length === 0) add('error', 'subject-empty', 1, '第 1 行冒号后没有主题')

  // Trailing period: a commit subject is a title, not a sentence.
  if (/[.。]\s*$/.test(commit.subject)) add('warn', 'subject-period', 1, '主题以句号结尾——提交主题是标题，不是句子')

  // Blank line between header and body: without it git treats everything as
  // one long subject line.
  if (lines.length > 1 && lines[1].trim() !== '') {
    add('error', 'body-separator', 2, '第 2 行应为空行——没有空行时 git 会把正文并入主题')
  }

  // Breaking changes: either `!` in the header or a BREAKING CHANGE: trailer.
  const hasBang = commit.bang
  const hasTrailer = /^\s*BREAKING[ _-]?CHANGE:/im.test(commit.body)
  if (hasBang && !hasTrailer) {
    add('warn', 'breaking-untrailed', 1, '第 1 行用了 ! 标记破坏性变更，但正文没有 BREAKING CHANGE: 段——下游工具按 trailer 解析')
  }

  // A body that is only one line and has no blank line is a long subject in
  // disguise; warn only when the header already fit.
  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, checked: { type: commit.type, scope: commit.scope, subject: length, lines: lines.length, typePolicy: policy }, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/commit-msg-check/api'
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
      return send(200, lintCommitMessage(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
