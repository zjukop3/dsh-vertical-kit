// A contract is unreviewable when a party is unnamed, no date anchors it, or
// the uppercase amount and the digits disagree. Those are decidable from the
// text, so this checks them before a lawyer has to. It is a checklist, not a
// lawyer: every finding is a missing structural element, never an opinion.

import { readFile } from 'node:fs/promises'

export const name = 'contract-check'
export const inject = ['webServer']

const DIGITS = { 零: 0, 壹: 1, 贰: 2, 叁: 3, 肆: 4, 伍: 5, 陆: 6, 柒: 7, 捌: 8, 玖: 9 }
const IUNIT = { 仟: 1e3, 佰: 1e2, 拾: 1e1 }
const SECTION = { 万: 1e4, 亿: 1e8 }
const UPPERCASE_RUN = /[零壹贰叁肆伍陆柒捌玖拾佰仟万亿元圆角分整]{3,}/g

// 人民币壹万贰仟叁佰肆拾伍元陆角柒分 → 12345.67. A leading 拾 means 1, per
// ordinary usage; anything this parser cannot read comes back as null and the
// caller decides whether that is a finding.
export function parseUppercaseAmount(text) {
  text = text.replace(/^(人民币|￥|¥)/, '')
  let value = 0
  let section = 0
  let digit = null
  let decimal = 0
  let decimalScale = 0
  let seenYuan = false
  for (const character of text) {
    if (character in DIGITS) {
      digit = DIGITS[character]
      continue
    }
    if (character in IUNIT) {
      section += (digit ?? 1) * IUNIT[character]
      digit = null
      continue
    }
    if (character in SECTION) {
      section = (section + (digit ?? 0)) * SECTION[character]
      value += section
      section = 0
      digit = null
      continue
    }
    if (character === '元' || character === '圆') {
      value += section + (digit ?? 0)
      section = 0
      digit = null
      seenYuan = true
      decimalScale = 0.1
      continue
    }
    if (character === '角') {
      if (decimalScale === 0.1) decimal += (digit ?? 0) * 0.1
      digit = null
      decimalScale = 0.01
      continue
    }
    if (character === '分') {
      if (decimalScale === 0.01) decimal += (digit ?? 0) * 0.01
      digit = null
      continue
    }
    if (character === '整') {
      digit = null
      continue
    }
    return null
  }
  if (!seenYuan) value += section + (digit ?? 0)
  const total = Math.round((value + decimal) * 100) / 100
  return Number.isFinite(total) && total > 0 ? total : null
}

export function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

function first(text, pattern) {
  const match = pattern.exec(text)
  return match ? { text: match[0], line: lineOf(text, match.index) } : null
}

export function lintContract(text, rules = {}) {
  const findings = []
  const add = (level, rule, message) => findings.push({ level, rule, message })

  const partyLine = first(text, /甲方[：:]\s*\S+/)
  if (!partyLine) add('error', 'party-a', '没有「甲方：」开头的行，合同不知道跟谁签')
  else if (/甲方[：:]\s*(?:[（(][^）)]*[）)])?\s*$/.test(partyLine.text.trim())) add('error', 'party-a', `第 ${partyLine.line} 行甲方名称为空`)

  const partyB = first(text, /乙方[：:]\s*\S+/)
  if (!partyB) add('error', 'party-b', '没有「乙方：」开头的行，合同不知道跟谁签')
  else if (/乙方[：:]\s*(?:[（(][^）)]*[）)])?\s*$/.test(partyB.text.trim())) add('error', 'party-b', `第 ${partyB.line} 行乙方名称为空`)

  const dateAnchor = first(text, /(签订|签署)日期[：:]?\s*\d{4}\s*[年-]\s*\d{1,2}\s*[月-]\s*\d{1,2}/)
  const looseDate = first(text, /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/)
  if (!dateAnchor && !looseDate) add('error', 'date', '全文没有任何日期，合同无法锚定生效时间')
  else if (!dateAnchor) add('warn', 'date', `第 ${looseDate.line} 行有日期，但没有「签订/签署日期」字样`)

  const uppercaseRuns = [...text.matchAll(UPPERCASE_RUN)]
    .map(match => ({ text: match[0], line: lineOf(text, match.index), value: parseUppercaseAmount(match[0]) }))
    .filter(run => run.value !== null && run.text.length >= 4)
  const numericRuns = [...text.matchAll(/(?:人民币|￥|¥)\s?([\d,，]+(?:\.\d{1,2})?)\s*元?/g)]
    .map(match => ({ text: match[0], line: lineOf(text, match.index), value: Number(match[1].replace(/[,，]/g, '')) }))
    .filter(run => Number.isFinite(run.value) && run.value > 0)

  if (uppercaseRuns.length === 0 && numericRuns.length > 0) {
    add('error', 'amount-uppercase', `第 ${numericRuns[0].line} 行有数字金额，全文没有大写金额`)
  } else if (uppercaseRuns.length === 1 && numericRuns.length >= 1) {
    const matched = numericRuns.find(run => Math.abs(run.value - uppercaseRuns[0].value) < 0.01)
    if (!matched) {
      add('error', 'amount-mismatch', `大写金额 ${uppercaseRuns[0].value}（第 ${uppercaseRuns[0].line} 行）与所有数字金额（${numericRuns.map(run => `${run.value}@${run.line}`).join('、')}）都对不上`)
    }
  } else if (uppercaseRuns.length > 1) {
    add('warn', 'amount-ambiguous', `全文出现 ${uppercaseRuns.length} 个大写金额，自动比对仅在恰好一个时进行`)
  }

  const signature = first(text, /(甲方|乙方)[（(]\s*(盖章|签章|公章|签字)[）)]/)
  if (!signature) add('error', 'signature', '没有「甲方（盖章）/乙方（盖章）」式签署栏')

  const dispute = first(text, /(争议解决|争议的处理|纠纷解决|仲裁|诉讼|管辖)/)
  if (!dispute) add('error', 'dispute', '没有争议解决条款（仲裁/诉讼/管辖）')

  const breach = first(text, /(违约责任|违反本合同|赔偿)/)
  if (!breach) add('error', 'breach', '没有违约责任条款')

  const term = first(text, /(合同期限|有效期|履行期限|租期|服务期)/)
  if (!term) add('warn', 'term', '没有期限条款（合同期限/有效期/履行期限）')

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level])
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/contract-check/api'
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
      return send(200, lintContract(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
