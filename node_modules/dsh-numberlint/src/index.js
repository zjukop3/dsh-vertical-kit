// The same quantity written two ways in one document is how a reader learns not
// to trust either number. This compares forms, not values: 4,985 and 4985 are the
// same number spelled differently, and 58.6% and 58.6 % are the same percentage
// with different spacing.

import { readFile } from 'node:fs/promises'

export const name = 'numberlint'
export const inject = ['webServer']

const THOUSANDS = /\d{1,3}(?:[,，\u00a0\u2009 ]\d{3})+/g
const PLAIN_LARGE = /(?<![\d.,，])\d{4,}(?![\d.,，])/g
const PERCENT = /\d+(?:\.\d+)?\s?%/g
const RANGE = /\d+(?:\.\d+)?\s*[–—‑-]\s*\d+(?:\.\d+)?/g

export function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

function formsOf(text, pattern, normalize) {
  const forms = new Map()
  for (const match of text.matchAll(pattern)) {
    const form = match[0]
    const value = normalize(form)
    if (!forms.has(value)) forms.set(value, new Map())
    const spelled = forms.get(value)
    spelled.set(form, (spelled.get(form) || 0) + 1)
  }
  return forms
}

export function lintNumbers(text) {
  const findings = []

  const thousands = formsOf(text, THOUSANDS, form => form.replace(/[,，\u00a0\u2009 ]/g, ''))
  const plain = formsOf(text, PLAIN_LARGE, form => form)
  const conflicts = new Map()
  for (const [value, spelled] of thousands) conflicts.set(value, new Map(spelled))
  for (const [value, spelled] of plain) {
    if (!conflicts.has(value)) continue
    for (const form of spelled.keys()) conflicts.get(value).set(form, (conflicts.get(value).get(form) || 0) + 1)
  }
  for (const [value, spelled] of conflicts) {
    const forms = [...spelled.keys()]
    if (forms.length > 1) {
      findings.push({
        level: 'warn',
        rule: 'thousands-inconsistent',
        message: `${value} is written ${forms.map(form => `"${form}"`).join(' and ')} in the same document`,
      })
    }
  }

  const percents = formsOf(text, PERCENT, form => form.replace(/\s/g, ''))
  for (const [value, spelled] of percents) {
    const forms = [...spelled.keys()]
    if (forms.length > 1) {
      findings.push({
        level: 'warn',
        rule: 'percent-spacing',
        message: `${value} is written ${forms.map(form => `"${form}"`).join(' and ')}`,
      })
    }
  }

  const ranges = formsOf(text, RANGE, form => form.replace(/\s/g, '').replace(/[—‑-]/g, '–'))
  for (const [value, spelled] of ranges) {
    const forms = [...spelled.keys()]
    if (forms.length > 1) {
      findings.push({
        level: 'warn',
        rule: 'range-dash',
        message: `the range ${value} is written ${forms.map(form => `"${form}"`).join(' and ')}`,
      })
    }
  }

  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/numberlint/api'
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
      return send(200, lintNumbers(text))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
