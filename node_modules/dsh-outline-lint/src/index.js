// A deliverable that opens with no statement of what it found, or that never
// says how to reproduce itself, is not reviewable no matter how long it is.
// This checks the shape of the document, not the quality of the reasoning.

import { readFile } from 'node:fs/promises'

export const name = 'outline-lint'
export const inject = ['webServer']

const SUMMARY = /^(结论|摘要|总结|结论先行|核心结论|summary|tl;?dr)/i
const REPRODUCTION = /^(复现|重现|如何复现|复现步骤|reproduc|how to reproduce)/i
const COMMAND = /^\s*(\$\s+)?(node|npm|pnpm|yarn|python3?|pip|bash|sh|curl|git|docker|make|cargo|go)\s+\S/m

export function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

export function headingsOf(text) {
  const headings = []
  let fence = false
  text.split('\n').forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    if (fence) return
    // `\s*` rather than `\s+` and an optional text group: a heading with its
    // text deleted (`##` alone on a line) is exactly the case `empty-heading`
    // exists for, and requiring text meant the rule could never see it.
    const match = /^(#{1,6})(?:\s+(.*))?\s*$/.exec(line)
    if (match) headings.push({ level: match[1].length, text: (match[2] ?? '').trim(), line: index + 1 })
  })
  return headings
}

export function lintOutline(text) {
  const headings = headingsOf(text)
  const findings = []

  const h1 = headings.filter(heading => heading.level === 1)
  if (h1.length === 0) {
    findings.push({ level: 'error', rule: 'no-title', message: 'the document has no level-1 heading, so it has no title' })
  } else if (h1.length > 1) {
    findings.push({
      level: 'warn',
      rule: 'multiple-h1',
      message: `${h1.length} level-1 headings (lines ${h1.map(heading => heading.line).join(', ')}); only the title should be one`,
    })
  }

  let previous = 0
  for (const heading of headings) {
    if (previous && heading.level > previous + 1) {
      findings.push({
        level: 'warn',
        rule: 'heading-jump',
        message: `line ${heading.line}: "${heading.text}" is h${heading.level} directly under h${previous}, which reads as a lost level`,
      })
    }
    previous = heading.level
  }

  for (const heading of headings) {
    if (heading.text.replace(/[#\s]/g, '') === '') {
      findings.push({ level: 'error', rule: 'empty-heading', message: `line ${heading.line}: heading with no text` })
    }
  }

  const hasSummaryHeading = headings.some(heading => SUMMARY.test(heading.text))
  const leadsWithConclusion = /^\s*(结论|核心结论|结论先行)[:：]/.test(text.replace(/^#.*$/m, '').trimStart())
  if (!hasSummaryHeading && !leadsWithConclusion) {
    findings.push({
      level: 'error',
      rule: 'no-conclusion',
      message: 'no conclusion before the body: add a heading matching 结论/摘要 or open the first paragraph with 结论：',
    })
  }

  const hasReproductionHeading = headings.some(heading => REPRODUCTION.test(heading.text))
  const hasCommand = COMMAND.test(text)
  if (!hasReproductionHeading && !hasCommand) {
    findings.push({
      level: 'error',
      rule: 'no-reproduction',
      message: 'nothing a reader can run: add a 复现 section or a fenced command',
    })
  }

  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, headings: headings.length, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/outline-lint/api'
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
      return send(200, lintOutline(text))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
