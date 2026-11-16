// Release notes are decidable from the markdown: a version, a date, what
// breaks, and how to get from the old version to this one. This verifies
// exactly those and names the heading that is missing them.

export const name = 'release-notes-check'
export const inject = ['webServer']

const VERSION_HEADING = /(?:^|\n)#{1,3}\s*v?\d+\.\d+/
const VERSION_LINE = /(?:版本|version)\s*[：:]\s*v?\d+\.\d+/i
const VERSION_TOKEN = /\bv?\d+\.\d+(\.\d+)?\b/
const DATE_HEADING = /(?:^|\n)#{1,3}[^\n]*\d{4}[-/.]\d{1,2}/
const DATE_LINE = /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/
const BREAKING_HEADING = /(?:^|\n)#{1,4}[^\n]*(?:breaking|破坏|不兼容|重大变更)/i
const BREAKING_LINE = /^[^\n]*(?:breaking|破坏性|不兼容|重大变更)/im
const UPGRADE_HEADING = /(?:^|\n)#{1,4}[^\n]*(?:升级|迁移|upgrade|migration|更新指南)/i
const UPGRADE_LINE = /^[^\n]*(?:升级|迁移|upgrade|migration)/im
const ORDER_HEADING = /(?:^|\n)#{1,3}\s*v?(\d+)\.(\d+)(?:\.(\d+))?/g

// Version headings in document order — used to check reverse-chronological
// ordering, the one convention every changelog reader relies on.
export function versionHeadings(text) {
  const out = []
  for (const match of text.matchAll(ORDER_HEADING)) {
    const line = text.slice(0, match.index).split('\n').length
    out.push({ line, major: Number(match[1]), minor: Number(match[2]), text: match[0].trim().replace(/^#+\s*/, '') })
  }
  return out
}

export function lintReleaseNotes(text, rules = {}) {
  const requireUpgrade = rules.requireUpgrade ?? true
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')

  // Version: a heading like `## 1.2.0` or a 版本： line.
  const hasVersion = lines.some(line => VERSION_HEADING.test(`\n${line}`)) || lines.some(line => VERSION_LINE.test(line))
  if (!hasVersion) add('error', 'version-missing', 0, '没有版本号标题（认得：## 1.2.0、## v1.2.0、版本：1.2.0）')

  // Date: a heading or line carrying a full date.
  const hasDate = lines.some(line => DATE_HEADING.test(`\n${line}`)) || lines.some(line => DATE_LINE.test(line))
  if (!hasDate) add('error', 'date-missing', 0, '没有发布日期（认得：## 2026-11-17、2026-11-17）')

  // Upgrade path: how to get from the previous version here.
  if (requireUpgrade && !lines.some(line => UPGRADE_HEADING.test(`\n${line}`)) && !lines.some(line => UPGRADE_LINE.test(line))) {
    add('warn', 'upgrade-missing', 0, '没有升级/迁移说明（认得：## 升级、## 迁移、upgrade guide）——如果这次没有破坏性变更，忽略这条')
  }

  // Ordering: later headings must not be older versions.
  const headings = versionHeadings(text)
  for (let index = 1; index < headings.length; index += 1) {
    const previous = headings[index - 1]
    const current = headings[index]
    if (current.major > previous.major || (current.major === previous.major && current.minor > previous.minor)) {
      add('error', 'order', current.line, `第 ${current.line} 行版本 ${current.text} 出现在更旧版本 ${previous.text} 之后——changelog 惯例是新版本在前`)
    }
  }

  // A breaking-change claim with no upgrade section is the one combination
  // that strands a reader.
  const hasBreaking = lines.some(line => BREAKING_HEADING.test(`\n${line}`)) || lines.some(line => BREAKING_LINE.test(line))
  const hasUpgrade = lines.some(line => UPGRADE_HEADING.test(`\n${line}`)) || lines.some(line => UPGRADE_LINE.test(line))
  if (hasBreaking && !hasUpgrade) add('error', 'breaking-without-upgrade', 0, '声明了破坏性变更但没有升级/迁移说明——读者被留在原地')

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, checked: { versions: headings.length, lines: lines.length }, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/release-notes-check/api'
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
      return send(200, lintReleaseNotes(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
