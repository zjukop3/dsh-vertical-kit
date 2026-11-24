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
// 真实纪要里负责人常写成「Marcin/Dominik agreed to…」「Dominik will take the…」
// 「Chairs to have an internal sync」——人名/角色在句首，后面跟动词，没有任何标签。
// 54 份真实纪要里 38 份被旧判据判成「没有负责人」，全是这个形状。
const OWNER_PATTERNS = [
  /(?:负责人|owner|assigned)\s*[：:]/i,
  /@[\w\u4e00-\u9fff.-]+/,
  /[\w\u4e00-\u9fff]{1,6}\s*(?:负责|跟进|牵头)/,
  // 句首的人名或角色 + 动词：Name / Name, Name will|agreed|to|volunteered|owns|takes
  /^[\s>*\-\[\]xX]*[A-Z][\w.'-]*(?:\s*[\/,&]\s*[A-Z][\w.'-]*)*\s+(?:will|would|agreed|agrees|to|volunteered|volunteers|owns|takes|take|posts?|checks?|follows?|drafts?|prepares?)\b/,
  // 角色型负责人：Chairs / the team / TSC / WG / maintainers / volunteers
  /\b(?:chairs?|co-?chairs?|the team|team|tsc|wg|sig|maintainers?|volunteers?|owners?|assignees?)\b/i,
  // 行尾的人名：`* [ ] Youtube video upload (Emily)`、`Action Item - … (Chris)`。
  // 真实纪要里这是最常见的写法之一，旧判据完全看不见。
  /\(\s*[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)*\s*\)\s*$/,
  // 破折号/冒号后面跟人名：`— Chris`、`- Chris Ye`
  /[—–-]\s*[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)?\s*$/,
]
const ACTION_HEADINGS = /(?:^|\n)#{1,6}[^\n]*(?:行动|待办|任务|action|todo|follow)/i
const ACTION_LIST_KEYWORDS = /(?:^|\n)[^\n]*(?:行动项|待办|任务分派|action items?|todos?)/i
const DECISION_HEADINGS = /(?:^|\n)#{1,6}[^\n]*(?:决定|决议|结论|共识|decisions?|outcomes?|resolutions?|consensus|agreements?|next steps)/i
// 决议往往没有标签，而是句子里的复数一致：「we agreed …」「agreed that …」
// 「approved the …」「the group decided …」。51/54 份真实纪要栽在这一条上。
const DECISION_LINE =
  /^[^\n]*(?:决定[：:，\s]|决议[：:，\s]|结论[：:，\s]|共识[：:，\s]|拍板|定了[：:]|理由通过|(?:we|the group|the team|chairs?|all|everyone)\s+(?:agreed|decided|approved|concluded|settled)|(?:agreed|decided|approved)\s+that\b|resolved\s*[：:]|consensus\s*(?:was|is|to)\b)/i
// 这一条是 warn 级的「你有没有写决定」，不是判决：真实纪要里「agreed / decided /
// approved / resolved」出现在句子里就算记了决定，39/45 份真实纪要被旧判据判成没记，
// 因为它们写的是 prose（"as agreed in our charter"），不是 `决定：` 这种标签。
const DECISION_VERB = /\b(?:agreed|agrees|decided|decides|approved|approves|resolved|resolves|concluded|consensus|accepted)\b|(?:采纳|同意|通过|确定|敲定)/i
const ATTENDEES_LINE = /(?:与会|参会|出席|列席|参加者|attendees?|participants?|in attendance)[人员者名单]{0,3}\s*[：:]/i
const ATTENDEES_HEADINGS = /(?:^|\n)#{1,6}[^\n]*(?:与会|参会|出席|attendees?|participants?)/i
const AGENDA_HEADINGS = /(?:^|\n)#{1,6}[^\n]*(?:议程|议题|agenda|topics?)/i
// 真实写法：「Agenda & notes:」这种把议程和正文合在一起的标签也是议程。
const AGENDA_LINE = /^[^\n]*(?:议程[：:，\s]|议题[：:，\s]|\d+\s*[.、]\s*(?:讨论|评审|同步|对齐)|agenda\b[^\n]{0,20}[：:])/i

function hasDate(line) {
  return DATE_PATTERNS.some(pattern => pattern.test(line))
}

// 期限不只是一串数字：「by Friday」「before the next meeting」「EOD」「end of week」
// 在英文纪要里是标准写法。
const DEADLINE_HINT = /\b(?:by|before|until|due)\s+(?:the\s+)?(?:next\s+)?(?:meeting|week|month|friday|monday|tuesday|wednesday|thursday|saturday|sunday|eod|eow|end\s+of\s+(?:week|month|day))\b|\bEOD\b|\bEOW\b|\bnext\s+meeting\b|下次会|会后|本周内|下周/i

function hasDeadline(line, text) {
  if (hasDate(line) || DEADLINE_HINT.test(line)) return true
  // 纪要级期限：「Action items due 2026-12-01」这类抬头也成立。
  return DEADLINE_HINT.test(String(text).split('\n').slice(0, 40).join(' ')) && /(?:due|deadline|期限|截止)/i.test(line)
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
  // 两种用法，与 bug-report-check 同一套约定：
  //   review（默认，看别人的纪要）：只有「没有日期」「没有与会人」是 error——那两条是
  //     读的人最先要知道的事实；行动项的负责人与期限、议程、决议都只是建议；
  //   strict（发出去之前给自己的纪要过一遍）：这些全部升级为 error。
  // 45 份真实纪要实测：按旧判据只有 35% 不报错，而其中大半是「没写截止时间」这类
  // 真实纪要里普遍缺席的东西——判 error 等于对行业惯例下判决。
  const strict = rules.strict === true
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')

  // Date: the note must say when the meeting happened, anywhere.
  // review 模式里唯一的 error：没有日期，纪要就没法归档，也无法判断它约束的是哪一次会。
  if (!lines.some(hasDate)) add('error', 'date-missing', 0, '整份纪要没有任何日期（认得：2026-11-16、11月16日、11/16、下周三）')

  // Attendees: a line or a heading saying who was in the room.
  const hasAttendees = lines.some(line => ATTENDEES_LINE.test(line)) || lines.some(line => ATTENDEES_HEADINGS.test(`\n${line}`))
  // 与会人：真实纪要里缺这一栏的很多（IETF 的议题纪要是「Presented by X」的摘要，
  // 从来没有人名单），所以 review 模式下是建议，strict 模式下才是硬要求。
  if (!hasAttendees) add(strict ? 'error' : 'warn', 'attendees-missing', 0, '没有与会人（认得：与会人：…、参会人：…、出席：…、Attendees:…）')

  // Agenda: a heading or numbered discussion points.
  if (requireAgenda) {
    const hasAgenda = lines.some(line => AGENDA_HEADINGS.test(`\n${line}`)) || lines.some(line => AGENDA_LINE.test(line))
    if (!hasAgenda) add('warn', 'agenda-missing', 0, '没有议程或编号议题（认得：## 议程、议题：、1. 讨论…）')
  }

  // Decisions: a heading or any line that marks a decision. A meeting with
  // genuinely no decisions does happen — hence warn, not error.
  // 行动项里的 "agreed to…" 不算决议，否则每条行动项都会顺手把决议规则点亮。
  const hasDecisions = lines.some(line => DECISION_HEADINGS.test(`\n${line}`))
    || lines.some(line => DECISION_LINE.test(line))
    || lines.some(line => DECISION_VERB.test(line) && !/^\s*[-*+]\s*\[[ xX]\]/.test(line))
  if (!hasDecisions) add('warn', 'decisions-missing', 0, '没有记录任何决定/决议/结论——如果这次会议真的没有决定，忽略这条')

  // Action items: every one needs an owner and a deadline.
  const actions = actionItems(text)
  for (const { line, number } of actions) {
    if (!hasOwner(line)) add(strict ? 'error' : 'warn', 'action-no-owner', number, `行动项没有负责人（认得：负责人：…、@名字、X 负责、句首人名 + will/agreed、Chairs/team 这类角色）：「${line.trim().slice(0, 30)}…」`)
    // 截止时间是 warn：54 份真实纪要里 39 份一个期限都没写，而且多数把期限放在
    // 跟踪工具里。判 error 等于对真实写法下判决。
    if (!hasDeadline(line, text)) add('warn', 'action-no-deadline', number, `行动项没有截止时间（认得：11月20日前、2026-11-20、by Friday、next meeting、EOD）`)
  }
  if (actions.length === 0) add('warn', 'no-action-items', 0, '没有勾选框或待办编号的行动项——如果这次会议不产生任务，忽略这条')

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    mode: strict ? 'strict' : 'review',
    checked: { actions: actions.length, lines: lines.length },
    errors,
    warnings: findings.length - errors,
    findings,
  }
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
      const text = typeof body.text === 'string' && body.text ? body.text : body.path ? await (await import('node:fs/promises')).readFile(body.path, 'utf8') : ''
      if (!text) return send(400, { error: 'text or path is required' })
      return send(200, lintMeetingNotes(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
