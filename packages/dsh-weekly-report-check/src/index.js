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

// `weekly-report.md` 在公开世界里还有第二种体裁：**社区周报 / 项目双周报**
// （APISIX 的 Community Weekly、各类 awesome 项目周更）。它没有「本周完成 / 下周计划 /
// 风险」这三段，而是「本期变更 / 数据 / 后续活动 / 怎么参与」。
// 2026-11-25 实测：filename:weekly-report.md 有 1562 份，抽 75 份——44 份是「怎么写周报」
// 的文档与 agent 技能提示，5 份是带 {{占位符}} 的模板，剩下的是社区周报、agent 生成
// 的验证报告与个人周报。拿个人周报的三段去判社区周报，52/57 报「没有本周完成」。
export const COMMUNITY_MARK =
  /(?:community (?:weekly|newsletter)|weekly newsletter|双周报|社区周报|contributor statistics|contributors?\b[^\n]{0,20}(?:new|count)|good first issue|本期|upcoming|参与方式|如何参与|star\s+us|加入我们)/i
export const COMMUNITY_SECTIONS = [
  ['period-missing', /(?:20\d\d[-/年]\d{1,2}|(?:Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul)\w*\s+\d{1,2}|week of|期间|本期)/i, '没有写这一期覆盖的时间范围'],
  ['changes-missing', /(?:##\s*(?:变更|更新|进展|development|changes|updates|highlights)|release|merged|PR[s]?\b|feat)/i, '没有写本期发生了什么（变更/合入/发布）'],
  ['next-missing', /(?:##\s*(?:下期|后续|计划|upcoming|next)|upcoming|计划|预告)/i, '没有写后续（下期计划 / upcoming）——读者不知道下一站是什么'],
]

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

  const strict = rules.strict === true
  if (COMMUNITY_MARK.test(String(text))) {
    // 社区周报：三条它自己该有的，缺项 warn（社区周报本来就随手编，strict 才是 error）。
    for (const [rule, pattern, message] of COMMUNITY_SECTIONS) {
      if (!pattern.test(String(text))) findings.push({ level: strict ? 'error' : 'warn', rule, line: 0, message })
    }
    const errors = findings.filter(finding => finding.level === 'error').length
    return { ok: errors === 0, genre: 'community', mode: strict ? 'strict' : 'review', checked: { genre: 'community', lines: text.split('\n').length }, errors, warnings: findings.length - errors, findings }
  }

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
  return { ok: errors === 0, genre: 'personal', mode: strict ? 'strict' : 'review', checked: { done: done.length, plan: plan.length, risks: risks.length }, errors, warnings: findings.length - errors, findings }
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
