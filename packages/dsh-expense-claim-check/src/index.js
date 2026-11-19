// An expense claim is decidable from its text: who is claiming, for which
// period, the individual lines and whether they add up to the stated total, the
// invoice numbers and whether any repeat, what each expense was for, and that
// someone approved it. This verifies exactly those.
//
// The rule that earns the package is `total-mismatch`. A claim whose lines sum
// to something other than the stated total is either a copy-paste or a
// deliberate round-up, and neither is visible to an approver reading a tidy
// table of numbers.

export const name = 'expense-claim-check'
export const inject = ['webServer']

const CLAIMANT_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:报销人|申请人|提交人|claimant|submitted by|employee)/i
const CLAIMANT_LINE = /^[^\n]*(?:报销人[：:]|申请人[：:]|提交人[：:]|claimant[：:\s]|employee[：:\s])/im
const PERIOD_LINE = /(?:报销期间|费用期间|发生期间|period|for the period)[：:\s]/i
const DATE = /\d{4}[ \t]*[-/.年][ \t]*\d{1,2}[ \t]*[-/.月][ \t]*\d{1,2}[ \t]*日?/
// An amount: 1,234.56 / ¥1234.56 / 1234.5 元
const AMOUNT = /(?:[¥￥]\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:元|块)?/g
const TOTAL_LINE = /^[^\n]*(?:合计|总计|报销总额|金额合计|total)[：:]/im
// No leading \b: `\b` needs a \w neighbour and CJK characters are not \w, so
// `\b发票号码` never matches after a Chinese comma. This is the same trap the
// commit-msg and incident-report packages hit; it was reintroduced here and the
// first smoke run reported `invoice-missing` on a claim full of invoice numbers.
const INVOICE_NUMBER = /(?:发票号码|发票号|invoice(?:\s*(?:no|number))?)[：:\s]*([A-Za-z0-9-]{6,})/gi
// A line-item row: starts with a bullet, a number, or is a markdown table row.
const ITEM_ROW = /^\s*(?:[-*+]\s+|\d+\s*[.、)）]\s+|\|[^|]*\|)\S/m
const PURPOSE = /(?:事由|用途|说明|purpose|description|reason)/i
const APPROVER_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:审批|批准|审核|approv)/i
const APPROVER_LINE = /^[^\n]*(?:审批人[：:]|批准人[：:]|审核人[：:]|approved by[：:\s]|approver[：:\s])/im
const CATEGORY = /(?:交通|差旅|住宿|餐饮|办公|招待|培训|通讯|会议|快递|交际|travel|meal|hotel|office|transport)/i
const CURRENCY = /[¥￥$€]|人民币|美元|USD|CNY|RMB/

// Prose only: a fenced example, or this check's own output pasted in, must not
// satisfy a structural rule.
const FENCE = /```[\s\S]*?```/g
export function proseOnly(text) {
  return String(text).replace(FENCE, blank => blank.replace(/[^\n]/g, ' '))
}

// Invoice numbers and dates are digits too, and an invoice number is longer than
// any plausible single expense. Both are removed before amounts are read, or a
// 14-digit invoice number becomes a 73-trillion-yuan line item.
const NOISE = new RegExp(`${INVOICE_NUMBER.source}|${DATE.source}`, 'gi')

export function withoutNoise(line) {
  return String(line).replace(NOISE, ' ')
}

export function amountsIn(line) {
  const out = []
  for (const match of withoutNoise(line).matchAll(AMOUNT)) {
    const whole = `${match[1]}${match[2] ? `.${match[2]}` : ''}`
    const value = Number(whole.replace(/,/g, ''))
    // A single expense line above ten million is a data error, not an amount;
    // treating it as one keeps a stray identifier out of the sum.
    if (Number.isFinite(value) && value < 10_000_000) out.push({ raw: match[0].trim(), value })
  }
  return out
}

// The rows that carry money, and the stated total. Split out so a test can pin
// the arithmetic without going through the whole lint.
export function lineItems(text) {
  const prose = proseOnly(text)
  const rows = prose.split('\n').filter(line => ITEM_ROW.test(line) && amountsIn(line).length > 0)
  return rows.map((line, index) => {
    const amounts = amountsIn(line)
    return { index, line, amount: amounts[amounts.length - 1].value }
  })
}

export function statedTotal(text) {
  for (const line of proseOnly(text).split('\n')) {
    if (!TOTAL_LINE.test(line)) continue
    const amounts = amountsIn(line.replace(TOTAL_LINE, ''))
    if (amounts.length > 0) return amounts[amounts.length - 1].value
  }
  return null
}

export function lintExpenseClaim(text, rules = {}) {
  const tolerance = rules.tolerance ?? 0.01
  const minItems = rules.minItems ?? 1
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const prose = proseOnly(text)

  if (String(text).trim() === '') {
    return { ok: false, checked: { items: 0 }, errors: 1, warnings: 0, findings: [{ level: 'error', rule: 'empty', line: 0, message: '报销单是空的' }] }
  }

  const lines = prose.split('\n')
  const has = (heading, line) => lines.some(row => heading.test(`\n${row}`)) || line.test(prose)

  if (!has(CLAIMANT_HEADING, CLAIMANT_LINE)) {
    add('error', 'claimant-missing', 0, '没有写明报销人（认得：报销人：、申请人：、Claimant：）——不知道谁在报销，这笔钱无法入账到人')
  }
  {
    // A period is either labelled, or two dates on one line (a range).
    const labelled = PERIOD_LINE.test(prose)
    const ranged = lines.some(line => (line.match(new RegExp(DATE.source, 'g')) || []).length >= 2)
    if (!labelled && !ranged && !DATE.test(prose)) {
      add('error', 'date-missing', 0, '没有费用发生日期或期间（认得：报销期间：、2026-11-01 至 2026-11-15）——没有期间的报销单无法判定属于哪个账期')
    } else if (!labelled && !ranged) {
      add('warn', 'period-unlabelled', 0, '全文只有一个日期，没有「报销期间」字样——单笔报销可以接受，多笔就分不清')
    }
  }

  const items = lineItems(text)
  if (items.length < minItems) {
    add('error', 'items-missing', 0, '没有带金额的明细行（认得：- 高铁票 553.50、| 住宿 | 480 |）——合计无法被核对')
  }

  const total = statedTotal(text)
  if (total === null) {
    add('error', 'total-missing', 0, '没有合计行（认得：合计：1,234.56、总计：¥980）——没有合计，审批人只能自己加')
  } else if (items.length > 0) {
    const sum = Math.round(items.reduce((acc, item) => acc + item.amount, 0) * 100) / 100
    if (Math.abs(sum - total) > tolerance) {
      add('error', 'total-mismatch', 0, `明细相加是 ${sum}，合计行写的是 ${total}，差 ${Math.round((total - sum) * 100) / 100}（容差 ${tolerance}）——要么抄错，要么有一行没列出来`)
    }
  }

  const numbers = [...prose.matchAll(INVOICE_NUMBER)].map(match => match[1].toUpperCase())
  const duplicates = [...new Set(numbers.filter((value, index) => numbers.indexOf(value) !== index))]
  if (duplicates.length > 0) {
    add('error', 'invoice-duplicate', 0, `发票号重复：${duplicates.join('、')}——同一张发票报两次，是报销里最常见的一类重复`)
  }
  if (numbers.length === 0 && items.length > 0) {
    add('warn', 'invoice-missing', 0, '一条发票号都没有（认得：发票号码：12345678）——没有发票号的明细无法在系统里核销')
  }

  if (!PURPOSE.test(prose)) {
    add('warn', 'purpose-missing', 0, '没有事由说明（认得：事由、用途、Purpose）——只有金额的报销单，审批人无法判断该不该批')
  } else if (!CATEGORY.test(prose)) {
    add('warn', 'category-missing', 0, '没有费用类别（认得：交通、差旅、住宿、餐饮、办公、招待）——类别决定进哪个科目')
  }

  if (!has(APPROVER_HEADING, APPROVER_LINE)) {
    add('error', 'approver-missing', 0, '没有审批人（认得：审批人：、批准人：、Approved by）——没有人批过的报销单不该进入付款')
  }

  // Codes, not spellings: a bare 元 is CNY, and counting raw tokens made
  // `553.50 元` and `12.00 美元` look like one currency because only 美元
  // matched the list and 元 did not.
  const CURRENCY_CODES = new Map([
    ['人民币', 'CNY'], ['CNY', 'CNY'], ['RMB', 'CNY'], ['¥', 'CNY'], ['￥', 'CNY'], ['元', 'CNY'],
    ['美元', 'USD'], ['USD', 'USD'], ['$', 'USD'],
    ['欧元', 'EUR'], ['EUR', 'EUR'], ['€', 'EUR'],
  ])
  // 美元 and 欧元 contain 元, so the longer tokens are matched first and their
  // spans removed before the bare 元 is read.
  const currencies = new Set()
  const stripped = prose.replace(/美元|欧元|USD|EUR|USD/g, match => { currencies.add(CURRENCY_CODES.get(match)); return ' '.repeat(match.length) })
  for (const match of stripped.matchAll(/人民币|CNY|RMB|元|[¥￥$€]/g)) currencies.add(CURRENCY_CODES.get(match[0]))
  if (currencies.size > 1 && !/(?:汇率|exchange rate|折算)/i.test(prose)) {
    add('warn', 'currency-mixed', 0, `出现 ${[...currencies].join('、')} 多种币种但没有汇率说明——合计无法确定是哪个币种`)
  }

  const errors = findings.filter(finding => finding.level === 'error').length
  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level])
  return {
    ok: errors === 0,
    checked: { items: items.length, sum: items.reduce((acc, item) => acc + item.amount, 0), total },
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/expense-claim-check/api'
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
      return send(200, lintExpenseClaim(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}