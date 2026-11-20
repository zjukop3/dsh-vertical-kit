// A security advisory is read by someone deciding two things in under a minute:
// "am I affected" and "what do I do now". Both are answerable from the text, so
// this checks for the five facts that answer them — the identifier, the
// severity, the affected range, the fixed version, and the way out — plus the
// two facts that make an advisory accountable: who to contact and when it was
// disclosed.
//
// The affected range is the rule that matters. "Users should upgrade" with no
// range forces every reader to guess whether their version is in it, and the
// guess is expensive in both directions: upgrading a frozen deployment for
// nothing, or sitting on a known-vulnerable one.

export const name = 'security-advisory-check'
export const inject = ['webServer']

const TITLE = /^#\s+\S/

// CVE, GHSA, or an explicit advisory id line. A bare "no id" advisory is not
// wrong — internal advisories exist — but then it has to say so with a line
// that carries an id, because "security notice" alone cannot be cross-referenced.
const ID_LINE = /(?:CVE-\d{4}-\d{4,}|GHSA(?:-[0-9a-z]{4}){3}|(?:公告|advisory)\s*(?:编号|id)\s*[：:]\s*\S)/i

// Severity has to be stated as a level, not implied by adjectives in prose.
// "a serious issue" is not a severity: nobody can triage on it.
const SEVERITY_LINE = /(?:严重程度|危险等级|严重性|severity)\s*[：:|]?\s*\**\s*(?:critical|high|medium|low|严重|高危|中危|低危|高|中|低)/i
const SEVERITY_VALUE = /(?:严重程度|危险等级|严重性|severity)\s*[：:|]?\s*\**\s*(critical|high|medium|low|严重|高危|中危|低危|高|中|低)/i

// An affected range is a comparison, not an instruction: `<= 0.1.10`,
// `< 2.3.0`, `0.1.0 至 0.1.10`. "early versions" and "before the fix" are not
// ranges, because the reader cannot evaluate them against their own version.
const AFFECTED_RANGE = /(?:受影响|影响范围|受影响版本|affected)[^\n]{0,80}?(?:<|<=|≤|至|through|before)\s*v?\d+\.\d+/i
const AFFECTED_NONE = /(?:受影响|影响范围)[^\n]{0,20}?(?:无|none|不适用)/i

// The fixed version, as a version. A link to the releases page is not one.
const FIXED_VERSION = /(?:修复版本|已修复|修复于|修复在|fixed in|patched in|resolved in|upgrade to)[^\n]{0,60}?v?\d+\.\d+/i

// 尚未修复的公告是合法文档，但必须说出来。实测 20 条真实 GHSA 记录里 20 条都没有
// patched_versions，其中 13 条正文也没提任何修复——「没修」和「漏写」在文本上
// 分不开，而这正是读者要的那一句。
const FIXED_NONE = /(?:暂无(?:可用)?(?:的)?修复|尚未修复|无修复版本|暂不修复|will not be fixed|won.t fix|no (?:fix|patched version|fix available)|unpatched|not planned)/i

// The way out for people who cannot upgrade today, or an explicit statement
// that there is none. Silence is the one answer that leaves a reader stuck.
const WORKAROUND = /(?:缓解|规避|临时措施|降级|关闭|禁用|workaround|mitigation|no workaround|暂无(?:可用)?的?缓解)/i

const CONTACT = /(?:security@|联系|邮箱|致谢|报告者|credit|acknowledg|report(?:ed)? by)/i
const DISCLOSURE = /(?:披露|公布|发布)(?:日期|时间)|disclos(?:ure|ed)\s*(?:date|on)/i

/** Parsed severity, normalised to one of critical/high/medium/low, or null. */
export function severityOf(text) {
  const match = String(text).match(SEVERITY_VALUE)
  if (!match) return null
  const value = match[1].toLowerCase()
  if (value === 'critical' || value === '严重') return 'critical'
  if (value === 'high' || value === '高危' || value === '高') return 'high'
  if (value === 'medium' || value === '中危' || value === '中') return 'medium'
  return 'low'
}

export function lintSecurityAdvisory(text, rules = {}) {
  const checkWorkaround = rules.checkWorkaround ?? rules.requireWorkaround ?? false
  const checkContact = rules.checkContact ?? false
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')
  const has = pattern => lines.some(line => pattern.test(line))

  if (!TITLE.test(text)) add('error', 'title-missing', 1, '第一行没有 `# 标题`——公告标题要能让人一眼认出是哪个漏洞')

  if (!ID_LINE.test(text)) {
    add('error', 'id-missing', 0, '没有漏洞编号（认得：CVE-2026-12345、GHSA-xxxx-xxxx-xxxx、公告编号：…）——没有编号的公告无法被检索、被交叉引用')
  }

  if (!SEVERITY_LINE.test(text)) {
    add('error', 'severity-missing', 0, '没有严重程度（认得：严重程度：high、危险等级：高危、severity: medium）——散文里的「严重」不是等级，无法据此排期')
  }

  const hasRange = has(AFFECTED_RANGE) || has(AFFECTED_NONE)
  if (!hasRange) {
    add('error', 'affected-missing', 0, '没有受影响版本范围（认得：受影响版本 <= 0.1.10、affected < 2.3.0、受影响范围：无）——「早期版本」「修复前」都不算范围，读者无法对照自己的版本')
  }

  if (!FIXED_VERSION.test(text) && !FIXED_NONE.test(text)) {
    add('error', 'fixed-missing', 0, '既没有修复版本，也没写「暂无可用修复」（认得：修复版本：0.1.11、fixed in 2.3.1、暂无可用修复）——读者分不清「没修」和「漏写」')
  }

  // 默认不查这两条：实测 20 条真实 GHSA 记录里 18 条正文没有缓解措施、15 条没有
  // 联系渠道（由平台代收）。一条在大多数合法文档上都开火的 warn 是噪音，
  // 它会训练读者忽略所有 warn。作者在意时用 --check-workaround / --check-contact。
  if (checkWorkaround && !WORKAROUND.test(text)) {
    add('warn', 'workaround-missing', 0, '没有缓解措施（认得：缓解措施、临时规避、暂无可用缓解）——今天升不了级的人需要知道现在该做什么，哪怕答案是「没有」')
  }

  if (checkContact && !has(CONTACT)) {
    add('warn', 'contact-missing', 0, '没有报告渠道或致谢（认得：security@…、致谢、reported by）——下一个发现同类问题的人不知道往哪报')
  }

  if (!has(DISCLOSURE)) {
    add('warn', 'disclosure-date-missing', 0, '没有披露日期（认得：披露日期：2026-11-18、disclosure date）——没有日期的公告无法判断是新的还是陈年的')
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked: { severity: severityOf(text), lines: lines.length },
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/security-advisory-check/api'
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
      return send(200, lintSecurityAdvisory(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}