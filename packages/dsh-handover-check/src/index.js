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
const ACCOUNT_ENTRY = /\b[\w.@-]+@[\w.-]+\.\w+|(?:GitHub|GitLab|npm|AWS|阿里云|腾讯云|Jenkins|VPN|SSH|数据库|admin|root|CI|Grafana|Slack|飞书|钉钉)\b|(?:账号|权限|密钥|token|secret)/i
const NOTHING_TO_HAND_OVER = /(?:无账号|无权限|没有账号|没有需要交接的账号|no accounts|no credentials|nothing to hand over)/i
const PENDING_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:未完成|待办|遗留|风险|pending|open items|known issues|risks)/i
const PENDING_LINE = /^[^\n]*(?:未完成[：:]|待办[：:]|遗留[：:]|pending[：:\s]|open items[：:\s])/im
const OWNER = /(?:负责人|接手|owner|负责|@[\w-]+)/i
const SIGN_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:签字|确认|签署|sign-?off|acknowledg|approved)/i
const SIGN_LINE = /(?:签字|签署|确认[：:]|已确认|sign-?off|acknowledged|approved by)/i

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

export function lintHandover(text, rules = {}) {
  const requirePending = rules.requirePending ?? true
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const prose = proseOnly(text)

  if (String(text).trim() === '') {
    return { ok: false, checked: { items: 0 }, errors: 1, warnings: 0, findings: [{ level: 'error', rule: 'empty', line: 0, message: '交接单是空的' }] }
  }

  const lines = prose.split('\n')
  const has = (heading, line) => lines.some(row => heading.test(`\n${row}`)) || line.test(prose)

  if (!has(HANDOVER_HEADING, HANDOVER_LINE)) {
    add('error', 'handover-person-missing', 0, '没有写明交接人（认得：交接人：、移交人：、Handover by）——不知道是谁在交接，责任无处落')
  }
  if (!has(RECEIVER_HEADING, RECEIVER_LINE)) {
    add('error', 'receiver-missing', 0, '没有写明接收人（认得：接收人：、接手人：、Receiver）——没人接手，交接就没发生')
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
      const text = typeof body.text === 'string' && body.text ? body.text : body.path ? (await import('node:fs/promises')).readFile(body.path, 'utf8') : ''
      if (!text) return send(400, { error: 'text or path is required' })
      return send(200, lintHandover(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}