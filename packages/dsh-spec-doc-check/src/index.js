// A spec is decidable: it names the problem, states acceptance criteria a
// reader could check, says what is deliberately out of scope, and — the rule
// that earns this package — its acceptance criteria must be verifiable rather
// than aspirational. 「体验良好」 cannot be accepted or rejected.

export const name = 'spec-doc-check'
export const inject = ['webServer']

const PROBLEM_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:背景|问题|目标|动机|problem|background|goal|objective)/i
const PROBLEM_LINE = /^[^\n]*(?:背景[：:，\s]|问题[：:，\s]|目标[：:，\s]|要解决)/
// 真实规格的验收标准常常叫 Test Plan 或 Graduation Criteria（Kubernetes KEP 全这样）。
// 只认「验收标准/acceptance criteria」会在 3/3 的真实 KEP 上误报——2026-11-20 实测。
const CRITERIA_HEADING =
  /(?:^|\n)#{1,6}[^\n]*(?:验收|接受标准|完成标准|acceptance criteria|definition of done|success criteria|test plan|graduation criteria|exit criteria|done when)/i
const CRITERIA_LINE = /^[^\n]*(?:验收标准[：:，\s]|接受标准[：:，\s]|完成标准[：:，\s])/i
const OUT_OF_SCOPE_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:不做|范围外|不在范围|非目标|out of scope|non-goals?)/i
const OUT_OF_SCOPE_LINE = /^[^\n]*(?:不做[：:，\s]|范围外|不在本次范围|非目标[：:，\s])/i
const OPEN_Q_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:待定|开放问题|未决|open questions?|tbd)/i

// Words that state a wish, not a criterion. Each needs a number, a threshold,
// or a named observable next to it before it can be accepted or rejected.
const VAGUE = ['良好', '优秀', '合理', '友好', '快速', '流畅', '尽量', '适当', '完善', '稳定', '高效', '简洁', 'fairly', 'reasonably', 'robust', 'fast', 'friendly', 'stable', 'efficient', 'good', 'better', 'improved']
// A criterion becomes checkable when it carries a number, a threshold, or a
// named observable (a metric, an endpoint, a file, a command).
const CHECKABLE = /\d|≥|≤|>|<|等于|不超过|至少|至多|毫秒|秒|分钟|小时|%|个|条|次|status|code|返回|包含|出现|通过|命令行|接口|字段/i

// Acceptance criteria items: bullets or numbered lines under a criteria heading,
// plus lines that self-identify.
export function criteriaItems(text) {
  const lines = text.split('\n')
  let inCriteria = false
  const out = []
  lines.forEach((line, index) => {
    if (/^#{1,6}\s/.test(line)) {
      inCriteria = CRITERIA_HEADING.test(`\n${line}`)
      return
    }
    if (inCriteria && /^\s*(?:[-*+]\s+|\d+\s*[.、)）]\s*)\S/.test(line)) {
      out.push({ line: index + 1, text: line.replace(/^\s*(?:[-*+]\s+|\d+\s*[.、)）]\s*)/, '').trim() })
    }
  })
  return out
}

export function vagueCriteria(items) {
  return items.filter(item => {
    const lower = item.text.toLowerCase()
    const hit = VAGUE.find(word => lower.includes(word))
    if (!hit) return false
    // The vague word is fine when the same item also carries a threshold.
    return !CHECKABLE.test(item.text)
  })
}

export function lintSpecDoc(text, rules = {}) {
  const minCriteria = rules.minCriteria ?? 2
  const requireOutOfScope = rules.requireOutOfScope ?? true
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = String(text).split('\n')

  if (String(text).trim() === '') {
    return { ok: false, checked: { criteria: 0 }, errors: 1, warnings: 0, findings: [{ level: 'error', rule: 'empty', line: 0, message: '文档是空的' }] }
  }

  // Problem: what this is for.
  const hasProblem = lines.some(line => PROBLEM_HEADING.test(`\n${line}`)) || lines.some(line => PROBLEM_LINE.test(line))
  if (!hasProblem) add('error', 'problem-missing', 0, '没有背景/问题/目标段——读者不知道这个方案在解决什么')

  // Acceptance criteria: the part a reviewer can check afterwards.
  const criteria = criteriaItems(text)
  const hasCriteriaHeading = lines.some(line => CRITERIA_HEADING.test(`\n${line}`)) || lines.some(line => CRITERIA_LINE.test(line))
  if (!hasCriteriaHeading && criteria.length === 0) {
    add('error', 'criteria-missing', 0, '没有验收标准（认得：## 验收标准 / ## Definition of Done + 条目）——没有验收标准的方案无法判定做完了没有')
  } else if (criteria.length < minCriteria) {
    add('warn', 'criteria-thin', criteria[0]?.line ?? 0, `验收标准只有 ${criteria.length} 条（下限 ${minCriteria}）——一条通常覆盖不了正常与异常两条路径`)
  }

  // The rule that earns the package: a criterion must be verifiable.
  for (const item of vagueCriteria(criteria)) {
    const word = VAGUE.find(candidate => item.text.toLowerCase().includes(candidate))
    add('error', 'criteria-vague', item.line, `第 ${item.line} 行验收标准含「${word}」但没有数字或可观测对象——「${item.text.slice(0, 24)}」既无法通过也无法拒绝`)
  }

  // Out of scope: the half of a spec that prevents scope creep.
  const hasOutOfScope = lines.some(line => OUT_OF_SCOPE_HEADING.test(`\n${line}`)) || lines.some(line => OUT_OF_SCOPE_LINE.test(line))
  if (requireOutOfScope && !hasOutOfScope) {
    add('error', 'out-of-scope-missing', 0, '没有「不做/范围外」段（认得：## 不做、## 非目标、Out of scope）——没写边界的方案在评审时会被无限扩大')
  }

  // Open questions: honest, but they must be listed rather than buried.
  const hasOpen = lines.some(line => OPEN_Q_HEADING.test(`\n${line}`))
  if (hasOpen) {
    const headingIndex = lines.findIndex(line => OPEN_Q_HEADING.test(`\n${line}`))
    const after = lines.slice(headingIndex + 1).filter(line => line.trim() !== '')
    const nextHeading = after.findIndex(line => /^#{1,6}\s/.test(line))
    const body = (nextHeading === -1 ? after : after.slice(0, nextHeading)).filter(line => /^\s*(?:[-*+]\s+|\d+\s*[.、)）]\s*)\S/.test(line))
    if (body.length === 0) add('warn', 'open-questions-empty', headingIndex + 1, '有「待定/开放问题」标题但下面没有条目——留个空标题比不写更让人困惑')
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked: { criteria: criteria.length, lines: lines.length },
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/spec-doc-check/api'
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
      return send(200, lintSpecDoc(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
