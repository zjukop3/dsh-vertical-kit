// A weekly report is decidable from the markdown: it must separate what was
// DONE from what is PLANNED, name the RISKS and BLOCKERS, and carry enough
// numbers that a reader can tell progress from motion. This verifies exactly
// those and names the section that is missing.

export const name = 'weekly-report-check'
export const inject = ['webServer']

const DONE_HEADINGS = /(?:^|\n)#{1,6}[^\n]*(?:本周完成|已完成|成果|done|completed|shipped)/i
const DONE_LINE = /^[^\n]*(?:本周(?:完成|做了|交付)|已完成|已修复|已上线|已交付)/
const PLAN_HEADINGS = /(?:^|\n)#{1,6}[^\n]*(?:下周|计划|规划|next week|planned|next)/i
const PLAN_LINE = /^[^\n]*(?:下周|计划[：:，\s]|计划做|将[：:，\s])/
const RISK_HEADINGS = /(?:^|\n)#{1,6}[^\n]*(?:风险|阻塞|困难|问题|risk|blocker|issue)/i
const RISK_LINE = /^[^\n]*(?:风险[：:，\s]|阻塞[：:，\s]|卡在|受阻|问题[：:，\s])/
const METRIC = /\d+(?:\.\d+)?\s*(?:%|个|条|次|人|天|小时|万|k\b|ms|s\b|qps|fps)/i

// Bullet items under a section are that section's items; a section with no
// bullets reads as a heading-only stub.
export function sectionItems(text, headingPattern, linePattern) {
  const lines = text.split('\n')
  let inSection = false
  const items = []
  lines.forEach((line, index) => {
    if (/^#{1,6}\s/.test(line)) {
      inSection = headingPattern.test(`\n${line}`)
      return
    }
    if (!inSection) return
    if (/^\s*[-*+]\s+\S/.test(line) || /^\s*\d+\s*[.、)）]\s*\S/.test(line)) items.push({ line: index + 1, text: line.trim() })
  })
  // Lines that self-identify (本周完成：…、风险：…) count without a heading.
  // Heading lines are excluded — "## 本周完成" contains the keywords but is
  // the section marker, not an item; bullets already collected above are
  // excluded too — "- 已上线…" contains 已上线 and would double-count.
  const collected = new Set(items.map(item => item.line))
  lines.forEach((line, index) => {
    const number = index + 1
    if (/^#{1,6}\s/.test(line) || collected.has(number)) return
    if (linePattern.test(line)) items.push({ line: number, text: line.trim() })
  })
  return items
}

export function lintWeeklyReport(text, rules = {}) {
  const minMetrics = rules.minMetrics ?? 1
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')

  const done = sectionItems(text, DONE_HEADINGS, DONE_LINE)
  const plan = sectionItems(text, PLAN_HEADINGS, PLAN_LINE)
  const risks = sectionItems(text, RISK_HEADINGS, RISK_LINE)

  if (done.length === 0) add('error', 'done-missing', 0, '没有「本周完成」段或自标识行（认得：## 本周完成、已完成：…、已上线…）——报告没有事实底座')
  if (plan.length === 0) add('error', 'plan-missing', 0, '没有「下周计划」段或自标识行（认得：## 下周计划、计划：…、下周…）——没有可被检验的承诺')

  // Risks are welcome but not mandatory — a quiet week happens. Absence is a
  // warn with an escape hatch.
  if (risks.length === 0) add('warn', 'risks-missing', 0, '没有风险/阻塞段（认得：## 风险、阻塞：…、卡在…）——如果本周真的没有风险，忽略这条')

  // Numbers: at least one quantified item, so the reader can tell progress
  // from motion. Counted across the whole report.
  const metricLines = lines.filter(line => METRIC.test(line)).length
  if (metricLines < minMetrics) add('warn', 'metrics-thin', 0, `全文只有 ${metricLines} 行带量化数字（% 、个、条、次、人、天、小时…，下限 ${minMetrics}）——「优化了性能」不可检验，「p95 从 820ms 降到 460ms」可以`)

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, checked: { done: done.length, plan: plan.length, risks: risks.length }, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/weekly-report-check/api'
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
      return send(200, lintWeeklyReport(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
