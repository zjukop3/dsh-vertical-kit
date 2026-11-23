// A migration guide is read mid-upgrade, by someone who has already started and
// cannot ask anyone. The three things that decide whether they finish are the
// version span (is this guide for my jump), the breaking changes (what will
// stop working), and the steps (what to type, in order). The three that decide
// whether they recover are verification, rollback, and — when data moves —
// a backup.
//
// The version span is the rule that matters most: "upgrade to 0.2.0" is a
// release note, not a migration guide. A guide says 0.1.0 到 0.2.0, because the
// person on 0.1.7 needs to know whether the intermediate jumps are implied.

export const name = 'migration-guide-check'
export const inject = ['webServer']

// 真实文档常用 frontmatter 给标题（Docusaurus/Jekyll/GitHub site-policy）。
// 只认 `# ` 会把 TanStack 的迁移指南判成没有标题。
export function titleOf(text) {
  const source = String(text).replace(/^\uFEFF/, '')
  const front = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (front && /^title:\s*\S+/m.test(front[1])) return 'frontmatter'
  if (/^#\s+\S/.test(source)) return 'heading'
  return null
}

function headOf(text) {
  const source = String(text).replace(/^\uFEFF/, '')
  const front = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (front) {
    const title = front[1].match(/^title:\s*(.+)$/m)
    if (title) return title[1]
  }
  return (source.match(/^#\s+[^\n]*/) || [''])[0]
}

const MIGRATION_WORD = /(?:迁移|升级|migrat|upgrad)/i

// A span: 从 x 到 y, x → y, from x to y. A single version is not a span.
const VERSION_SPAN = /(?:(?:从|from)\s*)?v?\d+\.\d+(?:\.\d+)?[^\n]{0,24}?(?:→|->|到|至|to|升级为|upgrade to)\s*v?\d+\.\d+/i

// Breaking changes: a section or an explicit labelled list. A sentence in prose
// that happens to contain 不兼容 is a mention, not a list — the reader cannot
// enumerate what broke from it.
const BREAKING_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:破坏|不兼容|breaking|incompatible)/i
const BREAKING_LABEL = /^[^\n]*(?:破坏性变更[：:]|不兼容变更[：:]|breaking changes?[：:])/i
// 有的指南整篇就是变更清单，没有一个叫「破坏性变更」的标题（Vite 的 migration.md
// 就是这种：Default Browser Target Change、Removed Module Resolution…）。
// 判据改成「有多少节在讲变更」，而不是「有没有那个词」。
const CHANGE_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:change|remov|renam|replac|deprecat|dropped|no longer|now uses|不再|废弃|改名|移除|变更)/i

export function changeSections(text) {
  return text
    .split('\n')
    .filter(line => /^#{1,6}\s/.test(line) && CHANGE_HEADING.test(`\n${line}`))
}

// Numbered steps. Reuses the same reading as the bug-report check: numbered
// lines are steps, prose is narrative.
// 只认编号行，不认项目符号：迁移的步骤是有序动作，`-` 列表是无序说明。
// 把两者算在一起，破坏性变更里的三条 bullet 会被当成三步「步骤」。
const NUMBERED = /^\s*\d+\s*[.、)）]\s*\S/

const ROLLBACK = /(?:回滚|退回|降级回|恢复备份|rollback|roll back|revert)/i
const VERIFY = /(?:验证|确认|自检|冒烟|smoke|verify|check that|should show)/i
const BACKUP = /(?:备份|导出|backup|snapshot)/i

export function versionSpan(text) {
  const match = String(text).match(VERSION_SPAN)
  if (match) return match[0].trim()
  // 真实存在的一类指南只写目标版本：「Migrating to TanStack Query v5」。
  // 目标版本 + 「迁移/升级」字样就够读者定位自己——在旧版的人都要迁到它。
  const head = headOf(text)
  if (MIGRATION_WORD.test(head)) {
    const version = head.match(/v?\d+(?:\.\d+)*/)
    if (version) return `→ ${version[0]}`
  }
  return null
}

export function numberedSteps(text) {
  return text
    .split('\n')
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter(entry => NUMBERED.test(entry.text))
}

export function lintMigrationGuide(text, rules = {}) {
  const minSteps = rules.minSteps ?? 3
  const requireSteps = rules.requireSteps ?? false
  const checkRecovery = rules.checkRecovery ?? false
  const requireRollback = rules.requireRollback ?? false
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')
  const has = pattern => lines.some(line => pattern.test(line))

  if (!titleOf(text)) add('error', 'title-missing', 1, '没有标题（认得：`# 标题`，或 frontmatter 里的 `title:`）——迁移指南的标题要写出「从哪到哪」')

  const span = versionSpan(text)
  if (!span) {
    add('error', 'from-to-missing', 0, '没有版本跨度（认得：从 0.1.0 到 0.2.0、0.1.7 → 0.2.0、from v1 to v2）——「升级到 0.2.0」是发布说明，不是迁移指南')
  }

  const changes = changeSections(text)
  if (!has(BREAKING_HEADING) && !has(BREAKING_LABEL) && changes.length < 3) {
    add('error', 'breaking-missing', 0, '没有可逐条对照的变更清单（认得：## 破坏性变更、## Breaking changes，或至少三节讲变更的小节）——散文里提一句「这次不兼容」不是清单')
  }

  const steps = numberedSteps(text)
  // 真实升级指南常常只列变更、不写编号步骤（Vite 与 TanStack 两份都是）。
  // 这类文档仍然可执行——读者照着改就行。所以默认 warn，--require-steps 才当 error。
  if (steps.length === 0) {
    add(requireSteps ? 'error' : 'warn', 'steps-missing', 0, '没有编号步骤（认得：1. … 2. …）——有步骤的指南能照着做，没有的只能照着读')
  }
  else if (steps.length < minSteps) add('warn', 'steps-thin', steps[0].line, `只有 ${steps.length} 步（下限 ${minSteps}）——步骤太少，读者会以为漏了没写出来的部分`)

  // 恢复类三问只对「流程型」指南有意义：有编号步骤，说明读者真的要动手改东西。
  // 只列变更的指南（Vite、TanStack 两份真实文档都是）没有可回滚的对象，问它
  // 「怎么回滚」等于问「改个 import 怎么备份」。2026-11-20 实测：不加这个条件，
  // 三条在 100% 的真实指南上都会开火——那是噪音，不是信号。
  const procedural = steps.length > 0 || checkRecovery
  if (procedural && !has(VERIFY)) {
    add('warn', 'verify-missing', 0, '没有验证方式（认得：## 验证、确认、冒烟、should show）——迁移完不知道该看哪，等于不知道自己成没成')
  }

  if (procedural && !has(ROLLBACK)) {
    const level = requireRollback ? 'error' : 'warn'
    add(level, 'rollback-missing', 0, '没有回滚方案（认得：## 回滚、rollback、恢复备份）——迁移失败时，回滚是唯一不用求人的路')
  }

  if (procedural && !has(BACKUP)) {
    add('warn', 'backup-missing', 0, '没有备份提示（认得：备份、导出、backup）——改之前先留一份，是最便宜的一条建议')
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked: { span, steps: steps.length, lines: lines.length },
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/migration-guide-check/api'
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
      const text = typeof body.text === 'string' && body.text ? body.text : body.path ? await (await import('node:fs/promises')).readFile(body.path, 'utf8') : ''
      if (!text) return send(400, { error: 'text or path is required' })
      return send(200, lintMigrationGuide(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}