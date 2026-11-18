// An architecture decision record is decidable: it has a status, the context
// that forced a choice, the decision itself, the consequences including the
// ones you did not want, and the alternatives that lost. An ADR whose
// consequences list only benefits did not think about the trade — that is the
// rule that earns this package.

export const name = 'adr-check'
export const inject = ['webServer']

const STATUS = /^\s*(?:[-*+]\s*)?(?:状态|status)\s*[：:]\s*(\S+)/im
const STATUS_VALUES = ['proposed', 'accepted', 'rejected', 'deprecated', 'superseded', '提议', '已接受', '已采纳', '已拒绝', '已废弃', '已取代', '草案', 'draft']
const CONTEXT_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:背景|上下文|context)/i
const DECISION_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:决定|决策|decision)/i
const CONSEQUENCE_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:后果|影响|结果|consequences?|impact|outcomes?)/i
const ALTERNATIVES_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:备选|替代方案|考虑过的方案|alternatives?|options considered)/i
const DATE = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/

// Cost words: the half of "consequences" that most ADRs leave out.
const COST = /代价|缺点|劣势|风险|成本|不利|trade[- ]?off|downside|drawback|risk|cost|negative|缺点/i
const BENEFIT = /好处|优点|优势|收益|benefit|advantage|upside|positive|收益/i

function sectionItems(text, headingPattern) {
  const lines = text.split('\n')
  let inside = false
  const out = []
  lines.forEach((line, index) => {
    if (/^#{1,6}\s/.test(line)) {
      inside = headingPattern.test(`\n${line}`)
      return
    }
    if (inside && /^\s*(?:[-*+]\s+|\d+\s*[.、)）]\s*)\S/.test(line)) out.push({ line: index + 1, text: line.trim() })
  })
  return out
}

export function lintAdr(text, rules = {}) {
  const requireAlternatives = rules.requireAlternatives ?? true
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = String(text).split('\n')

  if (String(text).trim() === '') {
    return { ok: false, checked: { consequences: 0 }, errors: 1, warnings: 0, findings: [{ level: 'error', rule: 'empty', line: 0, message: 'ADR 是空的' }] }
  }

  // Status: an ADR that does not say whether it is accepted is a proposal
  // pretending to be a record.
  const statusMatch = String(text).match(STATUS)
  if (!statusMatch) {
    add('error', 'status-missing', 0, `没有状态行（认得：状态：已接受、Status: accepted）——不知道这条决策是否已生效。可取值：${STATUS_VALUES.slice(0, 5).join('/')}…`)
  } else if (!STATUS_VALUES.some(value => statusMatch[1].toLowerCase().includes(value))) {
    add('warn', 'status-unknown', lines.findIndex(line => STATUS.test(line)) + 1, `状态「${statusMatch[1]}」不在常见取值里——自定义可以，但要确认是有意的`)
  }

  // Context: the forces that made a decision necessary.
  if (!lines.some(line => CONTEXT_HEADING.test(`\n${line}`))) add('error', 'context-missing', 0, '没有背景段（认得：## 背景、## Context）——不知道当时的约束，这条决策无法被后人重新评估')

  // Decision: what was chosen, in one sentence.
  if (!lines.some(line => DECISION_HEADING.test(`\n${line}`))) add('error', 'decision-missing', 0, '没有决定段（认得：## 决定、## Decision）——ADR 的核心就是那一句「我们选了 X」')

  // Consequences, and the balance rule.
  const consequences = sectionItems(text, CONSEQUENCE_HEADING)
  const hasConsequenceHeading = lines.some(line => CONSEQUENCE_HEADING.test(`\n${line}`))
  if (!hasConsequenceHeading && consequences.length === 0) {
    add('error', 'consequences-missing', 0, '没有后果段（认得：## 后果、## Consequences）——决策的代价是后来人最需要读的一段')
  } else {
    const consequenceText = consequences.map(item => item.text).join('\n')
    const hasCost = COST.test(consequenceText)
    const hasBenefit = BENEFIT.test(consequenceText)
    if (hasBenefit && !hasCost) {
      add('warn', 'consequences-one-sided', consequences[0].line, '后果段只有好处没有代价（缺：代价/缺点/风险/trade-off）——只写收益的 ADR 通常没真正权衡过')
    } else if (!hasCost && !hasBenefit && consequences.length > 0) {
      add('warn', 'consequences-unlabelled', consequences[0].line, '后果段没有区分好坏（认得：好处/代价、benefit/trade-off）——读者分不清哪条是要接受的成本')
    }
  }

  // Alternatives: the part that proves the decision was a choice.
  if (requireAlternatives && !lines.some(line => ALTERNATIVES_HEADING.test(`\n${line}`))) {
    add('warn', 'alternatives-missing', 0, '没有备选方案段（认得：## 备选、## Alternatives）——只写选中方案，读者无法知道当时有没有别的路')
  }

  // Date: when the decision was made.
  if (!DATE.test(text)) add('warn', 'date-missing', 0, '没有日期（认得：2026-11-18）——决策的时间点决定了它的上下文')

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked: { consequences: consequences.length, lines: lines.length },
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/adr-check/api'
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
      return send(200, lintAdr(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
