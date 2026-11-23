// An incident postmortem is decidable from the markdown: it puts the events on
// a timeline with times, it states who and what was affected and for how long,
// it names a root cause rather than a symptom, and every follow-up has an owner.
// This verifies exactly those and names the section that is missing.

export const name = 'incident-report-check'
export const inject = ['webServer']

const TIMELINE_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:时间线|经过|事件过程|timeline|chronology)/i
// Summary 一节就是影响陈述——真实 postmortem 普遍把「坏了什么、谁受影响」写在 Summary，
// 而不是单开一节叫 Impact（4 份实测文档里 4 份如此）。
const IMPACT_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:影响|impact|affected|summary|概述|摘要)/i
const IMPACT_LINE = /^[^\n]*(?:影响[：:，\s]|波及|受影响|影响面)/i
// 真实报告常常把影响写在 Summary 里：「production instance goes down」。
// 判据是「有没有说清坏了什么、影响了谁」，不是「有没有一节叫 Impact」。
const IMPACT_PROSE = /(?:outage|downtime|went down|unavailable|degraded|service disruption|affected \d|\d+ (?:users|customers)|生产环境(?:挂了|不可用)|服务中断)/i
const ROOT_CAUSE_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:根因|根本原因|原因分析|cause|post[- ]?mortem cause|root cause)/i
const ROOT_CAUSE_LINE = /^[^\n]*(?:根因[：:，\s]|根本原因[：:，\s]|root cause[：:\s])/i
// 真实模板里这一节可能叫 Prevention / Preventative actions（alantech 的 postmortem
// 就是），也可能叫 Action Items 且内容是表格（ogx 的 postmortem）。两种都要认。
const ACTION_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:行动项|改进项|后续|预防措施?|follow[- ]?ups?|action items?|prevent(?:ion|ative)?|next steps)/i
const OWNER = /(?:负责人|owner|负责[：:]|@[\w.-]+)/i
const OWNER_HEADER = /^(?:owner|负责人|assignee|who|责任[人方])$/i

// A timestamp: 14:32, 14:32:05, 2026-11-18 14:32, or 2:32 PM.
// 日期本身就是时间：跨天的事故，条目写「2023-01-08」已经回答了「什么时候」。
// 2026-11-20 实测：真实 postmortem 的时间线大量只用日期，旧的 HH:MM 规则让
// 一份报告 8 条时间线全被判「没有时间」。
const TIME = /\b\d{4}-\d{1,2}-\d{1,2}\b|\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\s*[AP]M)?\b/i

// Duration: 23 分钟, 1h20m, 45 seconds.
// No trailing \b on the CJK units: JavaScript's \b needs a \w neighbour and
// CJK characters are not \w, so `分钟\b` never matches. Splitting the ASCII
// units out keeps their boundary check where it is still meaningful.
const DURATION = /\d+\s*(?:秒|分钟|小时|天)|\b\d+\s*(?:minutes?|hours?|seconds?|days?)\b|(?:\d+[hms]){1,2}(?![\w])/i

export function timelineEntries(text) {
  const lines = text.split('\n')
  let inTimeline = false
  const out = []
  lines.forEach((line, index) => {
    if (/^#{1,6}\s/.test(line)) {
      inTimeline = TIMELINE_HEADING.test(`\n${line}`)
      return
    }
    if (!inTimeline) return
    if (/^\s*(?:[-*+]\s+|\d+\s*[.、)）]\s*)\S/.test(line)) {
      out.push({ line: index + 1, text: line.trim(), hasTime: TIME.test(line) })
      return
    }
    // 表格时间线：| Time (UTC) | Event |，第一格就是时间。表头与分隔行不算条目。
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^\s*\|?\s*:?-{2,}/.test(line)) return
      const cells = line.split('|').map(cell => cell.trim()).filter((cell, i, all) => !(i === 0 || i === all.length - 1) || cell !== '')
      const first = cells[0] ?? ''
      if (!TIME.test(first)) return
      out.push({ line: index + 1, text: cells.join(' · '), hasTime: true })
    }
  })
  return out
}

export function actionItems(text) {
  const lines = text.split('\n')
  let inActions = false
  let ownerColumn = -1
  const out = []
  lines.forEach((line, index) => {
    if (/^#{1,6}\s/.test(line)) {
      inActions = ACTION_HEADING.test(`\n${line}`)
      ownerColumn = -1
      return
    }
    if (!inActions) return
    if (/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s*)?|\d+\s*[.、)）]\s*)\S/.test(line)) {
      out.push({ line: index + 1, text: line.trim(), hasOwner: OWNER.test(line) })
      return
    }
    // 表格行动项：| # | Action | Owner | Status |。负责人那一列非空就算有人负责。
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^\s*\|?\s*:?-{2,}/.test(line)) return
      const cells = line.split('|').map(cell => cell.trim())
      // 表头：记下负责人列在第几格。表头往往同时含 owner 与其他字，所以先判表头再看列。
      if (cells.some(cell => OWNER_HEADER.test(cell)) && !/\d/.test(cells.join('|'))) {
        ownerColumn = cells.findIndex(cell => OWNER_HEADER.test(cell))
        return
      }
      const cell = ownerColumn > 0 ? cells[ownerColumn] : undefined
      const hasOwner =
        cell !== undefined
          ? Boolean(cell) && !/^(?:—|-|n\/a|tbd)$/i.test(cell)
          : OWNER.test(line)
      out.push({ line: index + 1, text: cells.filter(Boolean).join(' · '), hasOwner })
    }
  })
  return out
}

export function lintIncidentReport(text, rules = {}) {
  const minTimeline = rules.minTimeline ?? 2
  const requireDuration = rules.requireDuration ?? true
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')

  // Timeline: at least two timestamped entries. A postmortem without times
  // cannot answer "how long were we down", which is the first question asked.
  const timeline = timelineEntries(text)
  if (timeline.length === 0) {
    add('error', 'timeline-missing', 0, '没有时间线（认得：## 时间线 / ## 事件过程 + 带时间的条目）——没有时间的事故报告回答不了「挂了多久」')
  } else {
    if (timeline.length < minTimeline) add('warn', 'timeline-thin', timeline[0].line, `时间线只有 ${timeline.length} 条（下限 ${minTimeline}）——事故的发现、定位、恢复至少三个阶段`)
    const untimed = timeline.filter(entry => !entry.hasTime)
    for (const entry of untimed) {
      add('error', 'timeline-entry-untimed', entry.line, `第 ${entry.line} 行时间线条目没有时间：「${entry.text.slice(0, 30)}」`)
    }
  }

  // Impact: who and what, stated explicitly.
  const hasImpact =
    lines.some(line => IMPACT_HEADING.test(`\n${line}`)) ||
    lines.some(line => IMPACT_LINE.test(line)) ||
    IMPACT_PROSE.test(text)
  if (!hasImpact) add('error', 'impact-missing', 0, '没有影响段（认得：## 影响、影响：…、受影响…）——不知道影响谁的报告无法定级')

  // Duration: how long it lasted.
  if (requireDuration && !DURATION.test(text)) {
    add('warn', 'duration-missing', 0, '全文没有时长（认得：23 分钟、1 小时、45 秒）——读者要自己拿时间线相减才知道挂了多久')
  }

  // Root cause, not just what was done.
  const hasRootCause = lines.some(line => ROOT_CAUSE_HEADING.test(`\n${line}`)) || lines.some(line => ROOT_CAUSE_LINE.test(line))
  if (!hasRootCause) add('error', 'root-cause-missing', 0, '没有根因段（认得：## 根因、根本原因：…、root cause）——「重启后恢复」是处置，不是原因')

  // Follow-ups: every one needs an owner, or nothing will happen.
  const actions = actionItems(text)
  const hasActionSection = lines.some(line => ACTION_HEADING.test(`\n${line}`))
  if (actions.length === 0 && !hasActionSection) {
    add('error', 'actions-missing', 0, '没有后续行动项（认得：## 行动项 / ## 后续 / ## Prevention / ## Action Items）——没有后续的复盘只写了一份文档')
  } else if (actions.length === 0) {
    add('warn', 'actions-unlisted', 0, '有后续/预防这一节，但列不出可逐条跟踪的条目（认得：列表项或带 Owner 列的表格）——散文写「会加强监控」没法跟进度')
  } else {
    for (const action of actions) {
      if (!action.hasOwner) add('error', 'action-no-owner', action.line, `第 ${action.line} 行动项没有负责人（认得：负责人：…、@名字）：「${action.text.slice(0, 30)}」`)
    }
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked: { timeline: timeline.length, actions: actions.length, lines: lines.length },
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/incident-report-check/api'
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
      return send(200, lintIncidentReport(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
