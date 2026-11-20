// A meeting note is decidable from the markdown: a date, the people in the
// room, what was decided, and who carries each action item by when. This
// verifies exactly those, and says which line is missing whom.

export const name = 'meeting-notes-check'
export const inject = ['webServer']

const DATE_PATTERNS = [
  /\d{4}[-/.年]\s*\d{1,2}[-/.月]\s*\d{1,2}/,
  /\b\d{1,2}\/\d{1,2}\b/,
  /\b\d{1,2}-\d{1,2}\b/,
  /[下本]?周[一二三四五六日天末]/,
  /\d{1,2}\s*[月号日]/,
  // 英文日期：TC39、W3C、IETF 这些标准组织的会议纪要都写 "Tuesday, July 31, 2018"。
  // 2026-11-20 实测：只认中文与数字格式，会把 4/4 份真实纪要判成「没有日期」。
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+\d{4}\b/i,
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i,
]
const OWNER_PATTERNS = [/(?:负责人|owner|assigned)\s*[：:]/i, /@[\w\u4e00-\u9fff.-]+/, /[\w\u4e00-\u9fff]{1,6}\s*(?:负责|跟进|牵头)/]
const ACTION_HEADINGS = /(?:^|\n)#{1,6}[^\n]*(?:行动|待办|任务|action|todo|follow)/i
const ACTION_LIST_KEYWORDS = /(?:^|\n)[^\n]*(?:行动项|待办|任务分派|action items?|todos?)/i
const DECISION_HEADINGS = /(?:^|\n)#{1,6}[^\n]*(?:决定|决议|结论|decisions?|outcomes?)/i
const DECISION_LINE = /^[^\n]*(?:决定[：:，\s]|决议[：:，\s]|结论[：:，\s]|拍板|定了[：:])/i
const ATTENDEES_LINE = /(?:与会|参会|出席|列席|参加者|attendees?|participants?|in attendance)[人员者名单]{0,3}\s*[：:]/i
const ATTENDEES_HEADINGS = /(?:^|\n)#{1,6}[^\n]*(?:与会|参会|出席|attendees?|participants?)/i
const AGENDA_HEADINGS = /(?:^|\n)#{1,6}[^\n]*(?:议程|议题|agenda|topics?)/i
// 真实写法：「Agenda & notes:」这种把议程和正文合在一起的标签也是议程。
const AGENDA_LINE = /^[^\n]*(?:议程[：:，\s]|议题[：:，\s]|\d+\s*[.、]\s*(?:讨论|评审|同步|对齐)|agenda\b[^\n]{0,20}[：:])/i

function hasDate(line) {
  return DATE_PATTERNS.some(pattern => pattern.test(line))
}

function hasOwner(line) {
  return OWNER_PATTERNS.some(pattern => pattern.test(line))
}

// A checkbox item or a 待办-labelled numbered line is an action item. Plain
// numbered discussion points are not — numbering alone is how the whole note
// is structured, and treating every numbered line as a task would flag half
// the note.
export function actionItems(text) {
  const lines = text.split('\n')
  const out = []
  const seen = new Set()
  const push = (number, line) => {
    if (!seen.has(number)) {
      seen.add(number)
      out.push({ line, number })
    }
  }
  // Checkbox items are action items wherever they sit.
  lines.forEach((line, index) => {
    if (/^\s*[-*+]\s*\[[ xX]\]/.test(line)) push(index + 1, line)
  })
  // A 待办/行动/Action heading also makes numbered lines under it tasks —
  // numbering alone elsewhere is how the whole note is structured, and
  // treating every numbered line as a task would flag half the note.
  let inActions = false
  lines.forEach((line, index) => {
    if (/^#{1,6}\s/.test(line)) {
      inActions = ACTION_HEADINGS.test(`\n${line}`) || ACTION_LIST_KEYWORDS.test(`\n${line}`)
      return
    }
    if (inActions && /^\s*\d+\s*[.、)）]\s*\S/.test(line)) push(index + 1, line)
  })
  return out.sort((a, b) => a.number - b.number)
}

export function lintMeetingNotes(text, rules = {}) {
  const requireAgenda = rules.requireAgenda ?? true
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')

  // Date: the note must say when the meeting happened, anywhere.
  if (!lines.some(hasDate)) add('error', 'date-missing', 0, '整份纪要没有任何日期（认得：2026-11-16、11月16日、11/16、下周三）')

  // Attendees: a line or a heading saying who was in the room.
  const hasAttendees = lines.some(line => ATTENDEES_LINE.test(line)) || lines.some(line => ATTENDEES_HEADINGS.test(`\n${line}`))
  if (!hasAttendees) add('error', 'attendees-missing', 0, '没有与会人（认得：与会人：…、参会人：…、出席：…、Attendees:…）')

  // Agenda: a heading or numbered discussion points.
  if (requireAgenda) {
    const hasAgenda = lines.some(line => AGENDA_HEADINGS.test(`\n${line}`)) || lines.some(line => AGENDA_LINE.test(line))
    if (!hasAgenda) add('warn', 'agenda-missing', 0, '没有议程或编号议题（认得：## 议程、议题：、1. 讨论…）')
  }

  // Decisions: a heading or any line that marks a decision. A meeting with
  // genuinely no decisions does happen — hence warn, not error.
  const hasDecisions = lines.some(line => DECISION_HEADINGS.test(`\n${line}`)) || lines.some(line => DECISION_LINE.test(line))
  if (!hasDecisions) add('warn', 'decisions-missing', 0, '没有记录任何决定/决议/结论——如果这次会议真的没有决定，忽略这条')

  // Action items: every one needs an owner and a deadline.
  const actions = actionItems(text)
  for (const { line, number } of actions) {
    if (!hasOwner(line)) add('error', 'action-no-owner', number, `第 ${number} 行行动项没有负责人（认得：负责人：…、@名字、X 负责）：「${line.trim().slice(0, 30)}…」`)
    if (!hasDate(line)) add('error', 'action-no-deadline', number, `第 ${number} 行行动项没有截止时间（认得：11月20日前、2026-11-20、下周三）`)
  }
  if (actions.length === 0) add('warn', 'no-action-items', 0, '没有勾选框或待办编号的行动项——如果这次会议不产生任务，忽略这条')

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, checked: { actions: actions.length, lines: lines.length }, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/meeting-notes-check/api'
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
      return send(200, lintMeetingNotes(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
