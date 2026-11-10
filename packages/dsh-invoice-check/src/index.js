// An invoice is checkable without understanding the business: the credit code
// has a fixed alphabet, net plus tax should equal the total, and the uppercase
// amount should agree with the digits. This verifies exactly those, and labels
// everything else as not checked.

import { readFile } from 'node:fs/promises'
import { parseUppercaseAmount } from 'dsh-agreement-check'

export const name = 'invoice-check'
export const inject = ['webServer']

// GB 32100-2015: 18 characters, digits plus the letters that survive
// case-confusion exclusion (no I, O, S, V, Z).
const CREDIT_CODE = /^[0-9A-HJ-NPQRTUWXY]{18}$/
const INVOICE_NUMBER_20 = /^\d{20}$/
const INVOICE_NUMBER_8 = /^\d{8}$/

export function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

function amountsOf(text) {
  const net = firstAfter(text, /(不含税金额|金额)\s*[（(]?小写[）)]?\s*[：:]\s*[￥¥]?\s*([\d,，]+(?:\.\d{1,2})?)/)
    || firstAfter(text, /(不含税金额)\s*[：:]\s*[￥¥]?\s*([\d,，]+(?:\.\d{1,2})?)/)
  const tax = firstAfter(text, /(税额)\s*[（(]?小写[）)]?\s*[：:]\s*[￥¥]?\s*([\d,，]+(?:\.\d{1,2})?)/)
    || firstAfter(text, /税额\s*[：:]\s*[￥¥]?\s*([\d,，]+(?:\.\d{1,2})?)/)
  const total = firstAfter(text, /(价税合计)\s*[（(]?小写[）)]?\s*[：:]\s*[￥¥]?\s*([\d,，]+(?:\.\d{1,2})?)/)
    || firstAfter(text, /(价税合计|合计)\s*[：:]\s*[￥¥]?\s*([\d,，]+(?:\.\d{1,2})?)/)
  const toNumber = run => run && { ...run, value: Number(run.value.replace(/[,，]/g, '')) }
  return { net: toNumber(net), tax: toNumber(tax), total: toNumber(total) }
}

function firstAfter(text, pattern) {
  const match = pattern.exec(text)
  if (!match) return null
  const value = match[2] ?? match[1]
  return { label: match[1], value, line: lineOf(text, match.index) }
}

export function lintInvoice(text, { tolerance = 0.02 } = {}) {
  const findings = []
  const add = (level, rule, message) => findings.push({ level, rule, message })

  for (const match of text.matchAll(/(?:统一社会信用代码|纳税人识别号)\s*[：:]\s*([0-9A-Za-z]{15,20})/g)) {
    const code = match[1].toUpperCase()
    if (!CREDIT_CODE.test(code)) {
      add('error', 'credit-code', `第 ${lineOf(text, match.index)} 行 ${match[1]} 不是 18 位统一社会信用代码字符集（数字 + A-HJ-NPQRTUWXY）`)
    }
  }

  for (const match of text.matchAll(/发票号码\s*[：:]\s*(\d{6,26})/g)) {
    const number = match[1]
    if (!INVOICE_NUMBER_20.test(number) && !INVOICE_NUMBER_8.test(number)) {
      add('warn', 'invoice-number', `第 ${lineOf(text, match.index)} 行发票号码 ${number} 是 ${number.length} 位（数电票 20 位，纸质票 8 位）`)
    }
  }

  const { net, tax, total } = amountsOf(text)
  if (net && tax && total) {
    const sum = Math.round((net.value + tax.value) * 100) / 100
    if (Math.abs(sum - total.value) > tolerance) {
      add('error', 'amount-sum', `第 ${net.line} 行勾稽不平：不含税 ${net.value} + 税额 ${tax.value} = ${sum}，价税合计却是 ${total.value}（容差 ${tolerance}）`)
    }
  } else {
    const missing = [!net && '不含税金额', !tax && '税额', !total && '价税合计'].filter(Boolean)
    if (missing.length < 3) add('warn', 'amount-partial', `金额勾稽需要不含税金额、税额、价税合计三项，缺：${missing.join('、')}`)
  }

  const uppercase = [...text.matchAll(/[零壹贰叁肆伍陆柒捌玖拾佰仟万亿元圆角分整]{4,}/g)]
    .map(match => ({ text: match[0], line: lineOf(text, match.index), value: parseUppercaseAmount(match[0]) }))
    .filter(run => run.value !== null)
  if (total && uppercase.length === 1 && Math.abs(uppercase[0].value - total.value) > tolerance) {
    add('error', 'amount-uppercase', `大写金额 ${uppercase[0].value}（第 ${uppercase[0].line} 行）与价税合计 ${total.value}（第 ${total.line} 行）不一致`)
  } else if (uppercase.length > 1) {
    add('warn', 'amount-ambiguous', `出现 ${uppercase.length} 个大写金额，自动比对仅在恰好一个时进行`)
  }

  for (const label of ['购买方', '销售方']) {
    const block = text.match(new RegExp(`${label}[^\\n]{0,40}?名称\\s*[：:]\\s*\\S+`))
    if (!block) add('error', label === '购买方' ? 'buyer' : 'seller', `没有${label}名称栏`)
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level])
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/invoice-check/api'
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
      const text = typeof body.text === 'string' && body.text ? body.text : body.path ? await readFile(body.path, 'utf8') : ''
      if (!text) return send(400, { error: 'text or path is required' })
      return send(200, lintInvoice(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
