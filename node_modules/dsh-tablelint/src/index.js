// Ragged markdown tables are the most common defect in generated reports: they
// render fine in the editor that produced them and broken everywhere else.
// This counts cells, not vibes.

import { readFile } from 'node:fs/promises'

export const name = 'tablelint'
export const inject = ['webServer']

export function splitCells(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells = []
  let current = ''
  let escaped = false
  for (const character of trimmed) {
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  cells.push(current.trim())
  return cells
}

export function tablesOf(text) {
  const lines = text.split('\n')
  const tables = []
  let fence = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence
      continue
    }
    if (fence) continue
    const isRow = line.trim().startsWith('|') && line.includes('|', 1)
    const next = lines[index + 1] || ''
    const isDelimiter = /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(next) && next.includes('-')
    if (!isRow || !isDelimiter) continue
    const header = splitCells(line)
    const delimiter = splitCells(next)
    const rows = []
    let cursor = index + 2
    while (cursor < lines.length && lines[cursor].trim().startsWith('|')) {
      rows.push({ line: cursor + 1, cells: splitCells(lines[cursor]) })
      cursor += 1
    }
    tables.push({ line: index + 1, header, delimiter, rows })
    index = cursor - 1
  }
  return tables
}

export function lintTables(text) {
  const tables = tablesOf(text)
  const findings = []
  for (const table of tables) {
    if (table.header.length < 2) {
      findings.push({ level: 'warn', rule: 'single-column', message: `line ${table.line}: table has one column, which is a list wearing a table` })
    }
    if (table.delimiter.length !== table.header.length) {
      findings.push({
        level: 'error',
        rule: 'delimiter-count',
        message: `line ${table.line + 1}: ${table.delimiter.length} delimiter cells under ${table.header.length} header cells`,
      })
    }
    const headerKeys = table.header.map(cell => cell.toLowerCase())
    const duplicates = headerKeys.filter((cell, index) => cell && headerKeys.indexOf(cell) !== index)
    for (const duplicate of new Set(duplicates)) {
      findings.push({ level: 'warn', rule: 'duplicate-header', message: `line ${table.line}: two columns are both named "${duplicate}"` })
    }
    // A blank FIRST header cell is a deliberate pattern, not a defect: either the
    // table is a two-column layout card (`| | |` with an empty header row) or the
    // first column holds bold row labels. Two real third-party READMEs tripped
    // this, both on purpose. A blank header anywhere else still names nothing.
    const emptyAt = table.header.map((cell, index) => (cell === '' ? index : -1)).filter(index => index >= 0)
    // Two shapes are deliberate: every header cell blank (`| | |` — a layout card),
    // and only the first blank (bold row labels). Everything else names nothing.
    const allBlank = emptyAt.length === table.header.length
    const blankFirstOnly = emptyAt.length > 0 && emptyAt.every(index => index === 0)
    if (emptyAt.length > 0 && !allBlank && !blankFirstOnly) {
      findings.push({ level: 'warn', rule: 'empty-header', message: `line ${table.line}: a column has no header` })
    }
    for (const row of table.rows) {
      if (row.cells.length !== table.header.length) {
        findings.push({
          level: 'error',
          rule: 'column-count',
          message: `line ${row.line}: ${row.cells.length} cells in a ${table.header.length}-column table`,
        })
      }
    }
    if (table.rows.length === 0) {
      findings.push({ level: 'warn', rule: 'empty-table', message: `line ${table.line}: header and delimiter with no rows` })
    }
  }
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, tables: tables.length, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/tablelint/api'
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
      return send(200, lintTables(text))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
