// Reports fail the same three ways: a citation number that skips, two numbers
// pointing at one source, and a source listed but never actually cited. All
// three are decidable from the markdown alone, which is why they are worth
// checking automatically instead of by eye.

import { access, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'

export const name = 'citelint'
export const inject = ['webServer']

const DEFINITION = /^\[([^\]^][^\]]*)\]:\s*(\S+)/gm
const REFERENCE = /\[([^\]]+)\]\[([^\]]*)\]/g
const SHORTCUT = /\[([^\]\n]+)\](?![([:])/g
const FOOTNOTE = /\[\^([^\]]+)\]/g

export function parseCitations(text) {
  const definitions = []
  for (const match of text.matchAll(DEFINITION)) {
    definitions.push({ id: match[1].trim(), url: match[2].trim(), index: match.index })
  }
  const body = text.replace(DEFINITION, '')
  const used = new Set()
  for (const match of body.matchAll(REFERENCE)) {
    const id = (match[2] || match[1]).trim()
    if (id) used.add(id)
  }
  for (const match of body.matchAll(SHORTCUT)) used.add(match[1].trim())
  for (const match of body.matchAll(FOOTNOTE)) used.add(`^${match[1].trim()}`)
  return { definitions, used }
}

// Numbering is checked as a sequence, because "1, 2, 4" is the shape a deleted
// citation leaves behind and it is invisible once the list renders.
export function checkNumbering(definitions) {
  const numeric = definitions
    .map(definition => ({ id: definition.id, number: Number(definition.id) }))
    .filter(entry => Number.isInteger(entry.number))
  const findings = []
  const seen = new Set()
  for (const entry of numeric) {
    if (seen.has(entry.number)) {
      findings.push({ level: 'error', rule: 'duplicate-number', message: `citation [${entry.number}] is defined twice` })
    }
    seen.add(entry.number)
  }
  const numbers = [...seen].sort((a, b) => a - b)
  for (let index = 0; index < numbers.length; index += 1) {
    if (numbers[index] !== index + 1) {
      findings.push({
        level: 'warn',
        rule: 'numbering-gap',
        message: `citation numbers run ${numbers.join(', ')}; expected 1..${numbers.length}`,
      })
      break
    }
  }
  return findings
}

export async function lintCitations(text, { baseDirectory } = {}) {
  const { definitions, used } = parseCitations(text)
  const findings = [...checkNumbering(definitions)]
  const byUrl = new Map()
  for (const definition of definitions) {
    if (byUrl.has(definition.url)) {
      findings.push({
        level: 'warn',
        rule: 'duplicate-url',
        message: `[${definition.id}] and [${byUrl.get(definition.url)}] point at the same source: ${definition.url}`,
      })
    } else {
      byUrl.set(definition.url, definition.id)
    }
    if (!used.has(definition.id)) {
      findings.push({ level: 'warn', rule: 'unreferenced', message: `[${definition.id}] is defined and never cited in the text` })
    }
    const local = baseDirectory && !/^[a-z][a-z0-9+.-]*:/i.test(definition.url) && !definition.url.startsWith('#') && !definition.url.startsWith('/')
    if (local) {
      try {
        await access(resolve(baseDirectory, definition.url.split('#')[0]))
      } catch {
        findings.push({ level: 'error', rule: 'local-missing', message: `[${definition.id}] points at ${definition.url}, which is not in the delivered directory` })
      }
    }
  }
  for (const id of used) {
    if (/^\d+$/.test(id) && !definitions.some(definition => definition.id === id)) {
      findings.push({ level: 'error', rule: 'undefined', message: `[${id}] is cited and never defined` })
    }
  }
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked: definitions.length,
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/citelint/api'
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
      let text = typeof body.text === 'string' ? body.text : ''
      let baseDirectory = body.baseDirectory
      if (!text && typeof body.path === 'string') {
        text = await readFile(body.path, 'utf8')
        baseDirectory = baseDirectory || dirname(body.path)
      }
      if (!text) return send(400, { error: 'text or path is required' })
      return send(200, await lintCitations(text, {
        baseDirectory: baseDirectory && (isAbsolute(baseDirectory) ? baseDirectory : resolve(baseDirectory)),
      }))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
