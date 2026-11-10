// A listing is decidable from the export: title length bounds, repeated
// tokens, price validity, SKU completeness. This verifies exactly those, with
// configurable bounds, and says which row failed.

import { readFile } from 'node:fs/promises'

export const name = 'listing-check'
export const inject = ['webServer']

const TITLE_KEYS = ['title', '标题', '商品名称', '商品标题', '名称']
const PRICE_KEYS = ['price', '价格', '售价', '销售价']
const SKU_KEYS = ['sku', 'SKU', '编码', '货号', '商品编码']

export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
      continue
    }
    if (character === '"') {
      quoted = true
      continue
    }
    if (character === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(field)
      field = ''
      if (row.some(value => value !== '')) rows.push(row)
      row = []
      continue
    }
    field += character
  }
  row.push(field)
  if (row.some(value => value !== '')) rows.push(row)
  return rows
}

export function readRows(text) {
  if (text.trimStart().startsWith('[') || text.trimStart().startsWith('{')) {
    const parsed = JSON.parse(text)
    const rows = Array.isArray(parsed) ? parsed : parsed.items || parsed.list || []
    return rows.map(row => (typeof row === 'string' ? { title: row } : row))
  }
  const table = parseCsv(text)
  if (table.length === 0) return []
  const header = table[0].map(value => value.trim())
  return table.slice(1).map(cells => {
    const row = {}
    header.forEach((key, index) => { row[key] = (cells[index] ?? '').trim() })
    return row
  })
}

function pick(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== '') return String(row[key])
  }
  const lower = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]))
  for (const key of keys) {
    if (lower[key.toLowerCase()] !== undefined && lower[key.toLowerCase()] !== '') return String(lower[key.toLowerCase()])
  }
  return null
}

// Two repetition shapes are stuffing: a run of the same keyword written back to
// back (手机支架手机支架手机支架), and one word appearing again and again across
// a separated title. Single characters are ordinary in Chinese and never counted.
export function stuffedTokens(title, { minTokenLength = 2, maxRepeats = 3 } = {}) {
  const out = []
  const seen = new Set()
  for (const match of String(title).matchAll(/(.{2,6}?)\1+/g)) {
    const unit = match[1]
    const count = Math.round(match[0].length / unit.length)
    if (count >= maxRepeats && !seen.has(unit)) {
      seen.add(unit)
      out.push({ token: unit, count })
    }
  }
  const counts = new Map()
  for (const token of String(title).split(/[^\p{L}\p{N}]+/u).filter(token => token.length >= minTokenLength)) {
    counts.set(token, (counts.get(token) || 0) + 1)
  }
  for (const [token, count] of counts) {
    if (count >= maxRepeats && !seen.has(token)) {
      seen.add(token)
      out.push({ token, count })
    }
  }
  return out
}

export function lintListings(text, rules = {}) {
  const minTitle = rules.minTitle ?? 10
  const maxTitle = rules.maxTitle ?? 60
  const minPrice = rules.minPrice ?? 0.01
  const maxPrice = rules.maxPrice
  const findings = []
  const add = (level, rule, row, message) => findings.push({ level, rule, row, message })

  let rows
  try {
    rows = readRows(text)
  } catch (error) {
    return { ok: false, checked: 0, errors: 1, warnings: 0, findings: [{ level: 'error', rule: 'parse', row: 0, message: `cannot read rows: ${error.message}` }] }
  }

  rows.forEach((row, index) => {
    const number = index + 1
    const title = pick(row, TITLE_KEYS)
    if (title === null) add('error', 'title-missing', number, `第 ${number} 行没有标题列（认得：${TITLE_KEYS.join('/')}）`)
    else {
      const length = [...title].length
      if (length < minTitle) add('error', 'title-short', number, `第 ${number} 行标题 ${length} 字，少于下限 ${minTitle}：「${title.slice(0, 20)}…」`)
      if (length > maxTitle) add('error', 'title-long', number, `第 ${number} 行标题 ${length} 字，超过上限 ${maxTitle}`)
      for (const { token, count } of stuffedTokens(title, rules)) {
        add('warn', 'title-stuffing', number, `第 ${number} 行关键词「${token}」重复 ${count} 次（上限 ${rules.maxRepeats ?? 3}）`)
      }
    }

    const price = pick(row, PRICE_KEYS)
    if (price === null) add('error', 'price-missing', number, `第 ${number} 行没有价格列（认得：${PRICE_KEYS.join('/')}）`)
    else {
      const value = Number(String(price).replace(/[￥¥,，\s]/g, ''))
      if (!Number.isFinite(value) || value < minPrice) add('error', 'price-invalid', number, `第 ${number} 行价格「${price}」不是 ≥ ${minPrice} 的数字`)
      else if (maxPrice !== undefined && value > maxPrice) add('warn', 'price-high', number, `第 ${number} 行价格 ${value} 超过上限 ${maxPrice}`)
    }

    const sku = pick(row, SKU_KEYS)
    if (sku === null) add('error', 'sku-missing', number, `第 ${number} 行没有 SKU 列（认得：${SKU_KEYS.join('/')}）`)
    else if (!String(sku).trim()) add('error', 'sku-empty', number, `第 ${number} 行 SKU 为空`)
  })

  const seen = new Map()
  rows.forEach((row, index) => {
    const sku = pick(row, SKU_KEYS)
    if (sku === null) return
    if (seen.has(sku)) add('error', 'sku-duplicate', index + 1, `第 ${index + 1} 行 SKU「${sku}」与第 ${seen.get(sku)} 行重复`)
    else seen.set(sku, index + 1)
  })

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.row - b.row)
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, checked: rows.length, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/listing-check/api'
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
      return send(200, lintListings(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
