// A handover document is decidable from its text: who is leaving, who takes
// over, when it is effective, what is being handed over, which accounts and
// permissions move, what is still unfinished, and that the receiver signed for
// it. This verifies exactly those.
//
// The one rule that earns the package is `access-unlisted`: a handover that
// names no account or permission at all is the handover that leaves a live
// credential behind. Everything else here is bookkeeping a reviewer can see;
// that one is invisible until it is a problem.

export const name = 'handover-check'
export const inject = ['webServer']

const HANDOVER_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:交接人|移交人|离职人|handover by|handed over by|from)/i
const HANDOVER_LINE = /^[^\n]*(?:交接人[：:]|移交人[：:]|离职人[：:]|handover by[：:\s])/im
const RECEIVER_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:接收人|接手人|承接人|receiver|handover to|to[：:])/i
const RECEIVER_LINE = /^[^\n]*(?:接收人[：:]|接手人[：:]|承接人[：:]|receiver[：:\s])/im
// [ \t], not \s: a date at the end of a line must not swallow the blank line
// after it into its own match and print a newline inside the finding.
const DATE = /\d{4}[ \t]*[-/.年][ \t]*\d{1,2}[ \t]*[-/.月][ \t]*\d{1,2}[ \t]*日?/
const DATE_LABEL = /(?:交接日期|生效日期|交接时间|effective|handover date)[：:\s]/i
const ITEM = /^\s*(?:\d+[.、)]|[-*+])\s+\S/m
const ACCOUNTS_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:账号|帐号|权限|凭证|密钥|access|credential|accounts?|permissions?)/i
const ACCOUNTS_LINE = /^[^\n]*(?:账号[：:]|帐号[：:]|权限[：:]|密钥[：:]|credentials?[：:]|access[：:\s])/im
// A named account or permission, or an explicit statement that there are none.
// 英文与中文分支必须拆开：`(...|数据库|...)` 后面的 \b 要求下一个字符是 ASCII 词字符，
// 而中文文本里「数据库：」的冒号不是——那条分支于是永远不匹配。静态闸逮到的。
const ACCOUNT_ENTRY = /\b[\w.@-]+@[\w.-]+\.\w+|\b(?:GitHub|GitLab|npm|AWS|Jenkins|VPN|SSH|admin|root|CI|Grafana|Slack)\b|(?:阿里云|腾讯云|数据库|飞书|钉钉)|(?:账号|权限|密钥|token|secret)/i
const NOTHING_TO_HAND_OVER = /(?:无账号|无权限|没有账号|没有需要交接的账号|no accounts|no credentials|nothing to hand over)/i
const PENDING_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:未完成|待办|遗留|风险|pending|open items|known issues|risks)/i
const PENDING_LINE = /^[^\n]*(?:未完成[：:]|待办[：:]|遗留[：:]|pending[：:\s]|open items[：:\s])/im
const OWNER = /(?:负责人|接手|owner|负责|@[\w-]+)/i
const SIGN_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:签字|确认|签署|sign-?off|acknowledg|approved)/i
const SIGN_LINE = /(?:签字|签署|确认[：:]|已确认|sign-?off|acknowledged|approved by)/i

// A name slot filled with a non-answer. The check exists for silent gaps; a
// written-down non-answer is still a gap, just a more honest one.
// Prefix, not whole-string: 「尚未指定」 is 尚未 + 指定, and an anchored
// alternation of 尚未 alone never matched it. The rule's own test caught this —
// which is the point of writing the firing test before believing the rule.
const UNASSIGNED = /^(?:尚未|未指定|待定|待指派|暂无|没有|无$|to be determined|tbd|todo|n\/a|none|[-—–]+$)/i

// Prose only: a fenced example, or this check's own output pasted into the doc,
// must not satisfy a structural rule. Three of the checks in this kit shipped
// without that distinction and reported valid documents as broken.
const FENCE = /```[\s\S]*?```/g
export function proseOnly(text) {
  return String(text).replace(FENCE, blank => blank.replace(/[^\n]/g, ' '))
}

// The body of one `## heading` section, exclusive of the heading itself and of
// anything after the next heading. Without this, every bullet anywhere in the
// document counts as a handover item, and the accounts heading counts as an
// account because it contains the word 账号.
export function sectionOf(text, heading) {
  const lines = String(text).split('\n')
  const start = lines.findIndex(line => /^#{1,6}\s/.test(line) && heading.test(line))
  if (start === -1) return null
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{1,6}\s/.test(lines[index])) { end = index; break }
  }
  return lines.slice(start + 1, end)
}

const ITEMS_HEADING = /交接(?:事项|内容|清单|工作)|事项清单|工作交接|scope of handover|what is handed over/i

export function listItems(text) {
  return String(text).split('\n').filter(line => ITEM.test(line))
}

// 两种文体共用一个文件名：
//   人交接（交接单）——交接人、接收人、要转的账号与权限、未完成事项、接收人签字；
//   会话交接（HANDOVER.md）——Current State / What Was Done This Session / Files
//   Changed / Next Session，是给下一段会话或下一个 agent 看的。
// 后者没有「接收人」这回事，拿人交接的七条规则去判它，等于用它没打算做的事评价它。
// 2026-11-20 实测 3 份真实 HANDOVER.md：7 条规则全部误报，0/3 零发现。
export const SESSION_HANDOVER =
  /(?:^|\n)#{1,6}[^\n]*(?:current state|what was done|files changed|next session|session \d|handover.{0,20}session|session handover|agent handover|session summary|接棒|本次已完成|关键须知|下一段(?:会话|对话)|交接给(?:下一个)?\s*agent|会话交接|上下文交接)/i
// 「人交接」的词要带角色语义。裸词 receiver 会把硬件文档里的 USB Receiver 也认成接收人
// ——2026-11-20 实测：一份中文会话交接因此被误判成人交接，七条规则全报。
// 「交接给 / handover to X」不是人交接的判据：项目交接笔记也这么写
// （`# Handover to Opus`、`交接给下一个接手的人`）。只有明确的角色标签才算。
export const HUMAN_ROLES = /(?:交接人\s*[：:]|接收人\s*[：:]|交出人\s*[：:]|接手人\s*[：:]|接收方\s*[：:]|离职交接|handover\s+by\b|takeover\s+by\b|receiver\s*[：:]|signed\s+by|签字确认)/i

// 第三种体裁：项目交接笔记——个人项目交给下一个人，写给「下一个接手的人」而不是
// 某个具体同事。它没有接收人、没有签字、常常没有账号段，但有状态（仓库/分支/HEAD/
// 当前能跑到哪）、背景、已完成、待办、怎么继续。
// 2026-11-25 实测：GitHub 上 filename:HANDOVER.md 有 24864 份，抽 29 份跑旧判据，
// 只有 6 份通过——21 份栽在「没有接收人」，多数其实是这一种。
export const PROJECT_HANDOVER =
  /(?:^|\n)#{1,6}[^\n]*(?:项目背景|背景|状态|现状|已完成|完成情况|待办|未完成|下一步|怎么继续|如何继续|运行方式|开发环境|交接文档|交接笔记|到手即用|快速开始|project (?:background|state|status|overview|handover)|what'?s done|done so far|current (?:state|status)|remaining|next steps|quick ?start|onboarding|how to (?:run|continue|build))/i
export const PROJECT_META =
  /(?:更新时间|仓库[：:]|repo(?:sitory)?[：:]|分支[：:]|branch[：:]|\bHEAD\b|\bcommit\b|\bversion[：:]|版本[：:])/i

// 分类顺序（2026-11-25 两批共 49 份真实 HANDOVER.md 校准）：
//   组织交接 —— 只有出现明确的组织字段时才算：角色标签、账号与权限、签字。
//   会话交接 —— 有会话线索。
//   其余全部按项目交接笔记判。
// 反过来的顺序（默认当组织交接）在真实文件上是灾难：49 份里没有一份同时写了交接人与接收人，
// 31 份被判成「组织交接但缺人」——而那些文档压根不是组织交接。
// 组织字段必须是「段名或标签」，不是一个词：两批真实文档里 `credentials` 出现在
// 「设置你的凭证」这种安装说明里，`门禁` 是项目的一个功能——拿裸词判「这是组织交接」
// 会把 9 份项目交接笔记送进组织交接的七条规则，各报 2–5 个 error。
export const ORG_MARKERS =
  /(?:^|\n)#{1,6}[^\n]*(?:账号与权限|权限交接|账号移交|接入凭证|access\s*(?:list|control))|(?:账号|帐号|权限|凭证|密钥)\s*[：:]|签字确认|签署|已确认|sign-?off\s*[：:]/i

export function genreOf(text) {
  const source = String(text)
  if (HUMAN_ROLES.test(source) || ORG_MARKERS.test(source)) return 'org'
  if (SESSION_HANDOVER.test(source)) return 'session'
  return 'project'
}

export function isProjectHandover(text) {
  return genreOf(text) === 'project'
}

export function isSessionHandover(text) {
  return SESSION_HANDOVER.test(String(text)) && !HUMAN_ROLES.test(String(text))
}

export function lintHandover(text, rules = {}) {
  const requirePending = rules.requirePending ?? true
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })

  // 会话交接：给一条 warn 说明文体不符并停在这里，不再逐条判人交接的规则。
  if (String(text).trim() === '') {
    return { ok: false, genre: 'empty', checked: { items: 0 }, errors: 1, warnings: 0, findings: [{ level: 'error', rule: 'empty', line: 0, message: '交接单是空的' }] }
  }
  const genre = genreOf(text)
  if (genre === 'session') {
    findings.push({
      level: 'warn',
      rule: 'technical-handover',
      line: 0,
      message: '这份文档是「会话交接」（Current State / What Was Done / Files Changed），不是人交接：交接人、接收人、账号转移、接收人签字这些概念在这里不适用。本条只提醒文体不符，未做其它判定',
    })
    return { ok: true, genre: 'session', checked: { sessionHandover: true, items: 0 }, errors: 0, warnings: 1, findings }
  }
  // 项目交接笔记：判据是它自己的必填集合，缺项给 warn——这类文档本来就是随手写的，
  // 拿组织交接单的七条去判它只会得到「全错」。
  const strict = rules.strict === true
  if (genre === 'project') {
    const source = String(text)
    const checks = [
      ['project-state', /(?:\bHEAD\b|\bcommit\b|分支|branch|版本|version|最新|当前(?:状态|进度)|current (?:state|status))/i, '没有写当前状态（HEAD/分支/版本，或「现在能跑到哪一步」）——接手的人不知道从哪里开始'],
      ['project-done', /(?:已完成|已实现|完成情况|done|completed|implemented|shipped|landed)/i, '没有写已经完成了什么——读者无法判断哪些不用重做'],
      ['project-unfinished', /(?:待办|未完成|下一步|遗留|remaining|next steps|todo|open items|known issues)/i, '没有写未完成/下一步——接手的人会在第二周撞墙'],
      ['project-continue', /(?:怎么(?:继续|运行|跑)|如何(?:继续|运行)|运行方式|开发环境|复现|\bnpm (?:run|test|start)|\bpnpm\b|\bmake\b|\bcargo\b|\bgo test\b|\bpytest\b|how to (?:run|build|test|continue)|setup|\binstall\b)/i, '没有写怎么继续（运行/测试/构建命令）——文档读完了还是不知道怎么动手'],
    ]
    for (const [rule, pattern, message] of checks) {
      // review 模式是 warn：真实项目交接笔记本来就是随手写的（29 份里 19 份属于这一类，
      // 一份都没写全）。strict 模式才是「发出去之前给我补上」。
      if (!pattern.test(source)) findings.push({ level: strict ? 'error' : 'warn', rule, line: 0, message })
    }
    const errors = findings.filter(finding => finding.level === 'error').length
    return {
      ok: errors === 0,
      genre: 'project',
      mode: strict ? 'strict' : 'review',
      checked: { sessionHandover: false, items: listItems(text).length, checks: checks.length - findings.length },
      errors,
      warnings: findings.length,
      findings,
    }
  }

  const prose = proseOnly(text)

  const lines = prose.split('\n')
  const has = (heading, line) => lines.some(row => heading.test(`\n${row}`)) || line.test(prose)

  if (!has(HANDOVER_HEADING, HANDOVER_LINE)) {
    add('error', 'handover-person-missing', 0, '没有写明交接人（认得：交接人：、移交人：、Handover by）——不知道是谁在交接，责任无处落')
  }
  if (!has(RECEIVER_HEADING, RECEIVER_LINE)) {
    add('error', 'receiver-missing', 0, '没有写明接收人（认得：接收人：、接手人：、Receiver）——没人接手，交接就没发生')
  } else {
    // A label is not a person. `接收人：尚未指定` used to pass, because the rule
    // looked for the label and never for a name — found by writing this project's
    // own handover honestly, which says exactly that.
    const line = prose.split('\n').find(row => RECEIVER_LINE.test(row)) ?? ''
    const value = line.replace(/^[^:：]*[:：]/, '').replace(/[（(].*$/, '').trim()
    if (value === '' || UNASSIGNED.test(value)) {
      add('error', 'receiver-unassigned', 0, `接收人写的是「${value || '空'}」——那不是一个人。交接单只有在有人接下之后才成立`)
    }
  }

  const date = prose.match(DATE)
  if (!date) {
    add('error', 'date-missing', 0, '没有交接日期（认得：2026-11-19、2026年11月19日）——没有生效时间的交接单无法判定哪一版有效')
  } else if (!DATE_LABEL.test(prose)) {
    add('warn', 'date-unlabelled', 0, `全文有日期 ${date[0]}，但没有「交接日期/生效日期」字样`)
  }

  // Count the items in the handover section when there is one, so a long
  // accounts list cannot make a thin handover look substantial.
  const itemsSection = sectionOf(prose, ITEMS_HEADING)
  const items = (itemsSection ?? prose.split('\n')).filter(line => ITEM.test(line))
  if (items.length < 3) {
    add('error', 'items-thin', 0, `列出的事项只有 ${items.length} 条——交接至少要三条，少于三条的交接单通常漏了东西`)
  }
  const ownerless = items.filter(item => !OWNER.test(item))
  if (items.length >= 3 && ownerless.length === items.length) {
    add('warn', 'no-owners', 0, `${items.length} 条事项里没有一条写了负责/接手人——接手人只能自己猜从哪开始`)
  }

  // The rule the package exists for.
  const accountsSection = has(ACCOUNTS_HEADING, ACCOUNTS_LINE)
  const explicitNone = NOTHING_TO_HAND_OVER.test(prose)
  if (!accountsSection) {
    add('error', 'access-unlisted', 0, '没有账号/权限段（认得：## 账号与权限、账号：、Access）——交接单不列账号，等于留下一组没人管的活凭证')
  } else if (!explicitNone) {
    // Look inside the section, not at it: the heading itself says 账号 and would
    // otherwise satisfy the rule that asks for a named account.
    const body = sectionOf(prose, ACCOUNTS_HEADING) ?? lines
    const accountLines = body.filter(line => line.trim() !== '' && !/^#{1,6}\s/.test(line) && ACCOUNT_ENTRY.test(line))
    if (accountLines.length === 0) {
      add('warn', 'access-empty', 0, '有账号/权限段但一条具体账号都没写——如果确实没有可交接的账号，写「无账号需交接」')
    }
  }

  if (requirePending && !has(PENDING_HEADING, PENDING_LINE)) {
    add('warn', 'pending-missing', 0, '没有未完成/遗留事项段（认得：## 未完成事项、遗留：、Known issues）——只看已完成的部分，接手人会在第二周撞墙')
  }

  if (!has(SIGN_HEADING, SIGN_LINE)) {
    add('error', 'signoff-missing', 0, '没有接收人签字/确认（认得：## 签字确认、已确认、Sign-off）——没签字就没有人核对过交接是否完整')
  }

  const errors = findings.filter(finding => finding.level === 'error').length
  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level])
  return {
    ok: errors === 0,
    checked: { items: items.length, accounts: has(ACCOUNTS_HEADING, ACCOUNTS_LINE) },
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/handover-check/api'
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
      return send(200, lintHandover(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}