// A spec is decidable: it names the problem, states acceptance criteria a
// reader could check, says what is deliberately out of scope, and — the rule
// that earns this package — its acceptance criteria must be verifiable rather
// than aspirational. 「体验良好」 cannot be accepted or rejected.

export const name = 'spec-doc-check'
export const inject = ['webServer']

const PROBLEM_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:背景|问题|目标|动机|problem|background|goal|objective)/i
const PROBLEM_LINE = /^[^\n]*(?:背景[：:，\s]|问题[：:，\s]|目标[：:，\s]|要解决)/
// 真实规格的验收标准常常叫 Test Plan 或 Graduation Criteria（Kubernetes KEP 全这样）。
// 只认「验收标准/acceptance criteria」会在 3/3 的真实 KEP 上误报——2026-11-20 实测。
const CRITERIA_HEADING =
  /(?:^|\n)#{1,6}[^\n]*(?:验收|接受标准|完成标准|acceptance criteria|definition of done|success criteria|test plan|graduation criteria|exit criteria|done when)/i
const CRITERIA_LINE = /^[^\n]*(?:验收标准[：:，\s]|接受标准[：:，\s]|完成标准[：:，\s])/i
const OUT_OF_SCOPE_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:不做|范围外|不在范围|非目标|out of scope|non-goals?)/i
const OUT_OF_SCOPE_LINE = /^[^\n]*(?:不做[：:，\s]|范围外|不在本次范围|非目标[：:，\s])/i
const OPEN_Q_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:待定|开放问题|未决|open questions?|tbd)/i

// 第二体裁：**参考文档**（reference / contract doc）。DSH 自带的 subsystems/ 47 份就是这种：
// 「一个子系统一页：它是什么、搬哪些数据结构、以及生成的 Cordis API 一节」。它不是提案，
// 没有验收标准，也没有「不做」——对它问这些，等于问说明书「你的验收标准是什么」。
// 判据用「它有没有在描述既有实现」：源码路径、生成的 API 节、服务/事件节。
const SOURCE_LINK = /(?:Source:|源码|实现见|见\s*`packages\/)[^\n]*`?packages\//i
const API_SECTION = /(?:^|\n)#{1,6}[^\n]*(?:Cordis API|Service behavior|The service|Events|Contract|API reference|接口|事件)/i
const IDENT_DENSITY = /`[A-Za-z_$][\w.$]*`/g

// Words that state a wish, not a criterion. Each needs a number, a threshold,
// or a named observable next to it before it can be accepted or rejected.
const VAGUE = ['良好', '优秀', '合理', '友好', '快速', '流畅', '尽量', '适当', '完善', '稳定', '高效', '简洁', 'fairly', 'reasonably', 'robust', 'fast', 'friendly', 'stable', 'efficient', 'good', 'better', 'improved']
// A criterion becomes checkable when it carries a number, a threshold, or a
// named observable (a metric, an endpoint, a file, a command).
const CHECKABLE = /\d|≥|≤|>|<|等于|不超过|至少|至多|毫秒|秒|分钟|小时|%|个|条|次|status|code|返回|包含|出现|通过|命令行|接口|字段/i

// Acceptance criteria items: bullets or numbered lines under a criteria heading,
// plus lines that self-identify.
export function criteriaItems(text) {
  const lines = text.split('\n')
  let inCriteria = false
  const out = []
  lines.forEach((line, index) => {
    if (/^#{1,6}\s/.test(line)) {
      inCriteria = CRITERIA_HEADING.test(`\n${line}`)
      return
    }
    if (inCriteria && /^\s*(?:[-*+]\s+|\d+\s*[.、)）]\s*)\S/.test(line)) {
      out.push({ line: index + 1, text: line.replace(/^\s*(?:[-*+]\s+|\d+\s*[.、)）]\s*)/, '').trim() })
    }
  })
  return out
}

export function vagueCriteria(items) {
  return items.filter(item => {
    const lower = item.text.toLowerCase()
    const hit = VAGUE.find(word => lower.includes(word))
    if (!hit) return false
    // The vague word is fine when the same item also carries a threshold.
    return !CHECKABLE.test(item.text)
  })
}

export function isReferenceDoc(text) {
  const source = String(text)
  const idents = (source.match(IDENT_DENSITY) ?? []).length
  // 「像参考文档」有三条线索，命中一条即可：指向实现的路径、生成/手写的 API 节、
  // 或者高密度代码标识符（参考文档通篇在点名类型与服务；提案不是）。
  // 只用前两条时，没有 Source 行、标题也不叫 Service 的那几页（scope / slots / conversation）
  // 会掉回提案分支，被判「没有验收标准」。
  const declared = SOURCE_LINK.test(source) || API_SECTION.test(source) || idents >= 8
  // 提案的判据只用「验收标准」与「范围外」两个节：这两个节在参考文档里几乎不出现。
  // 第一版还把「背景/问题/目标」算进去，于是 `score.md`、`jobs.md`（## Background Job Runtime）
  // 这种「讲某个概念的文档」被当成「有背景一节的提案」——关键词在标题里，不在角色里。
  const proposalish = CRITERIA_HEADING.test(source) || OUT_OF_SCOPE_HEADING.test(source)
  // 收尾再要求 idents>=3 是错的：一份**少了标识符**的参考文档正好是要报 surface-missing
  // 的那种，结果它先被判定成提案，然后被要求写验收标准。结构性线索（Source 行、API 节）
  // 已经足够认定体裁；密度只是没有结构线索时的替代判据。
  return declared && !proposalish
}

// 第三种体裁：**生成的图页**（DSH 的 agent-lifecycle.md：一段 mermaid 时序图 + 一句说明，
// 文件头写着 do not edit by hand）。对它问「验收标准」等于问一张图它的验收标准是什么。
export function isDiagramPage(text) {
  return /```(?:mermaid|dot|graphviz|plantuml)\b/.test(String(text))
}

// 索引页（DSH 的 subsystems/README.md：一张表，每行指向一页）：不是方案，也不是参考页。
export function isIndexPage(text) {
  const source = String(text)
  const links = (source.match(/\]\([^)]*\.md\)/g) ?? []).length
  // 光看链接数不够：参考文档也到处互链（47 份 subsystems 每页都链一堆），用 10 条链接做
  // 判据把 15 份参考页当成索引页。真正的索引页没有代码标识符——它只有名字和链接。
  const idents = (source.match(IDENT_DENSITY) ?? []).length
  return links >= 10 && idents < 5 && !CRITERIA_HEADING.test(source)
}

export function lintSpecDoc(text, rules = {}) {
  const minCriteria = rules.minCriteria ?? 2
  const requireOutOfScope = rules.requireOutOfScope ?? true
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = String(text).split('\n')

  if (String(text).trim() === '') {
    return { ok: false, checked: { criteria: 0 }, errors: 1, warnings: 0, findings: [{ level: 'error', rule: 'empty', line: 0, message: '文档是空的' }] }
  }

  if (isDiagramPage(text)) {
    const hasTitle = /^#\s+\S/m.test(String(text))
    if (!hasTitle) add('error', 'title-missing', 1, '没有标题——生成出来的图页也要有一句它画的是什么')
    return {
      ok: hasTitle,
      checked: { criteria: 0, lines: lines.length, genre: 'diagram' },
      errors: hasTitle ? 0 : 1,
      warnings: 0,
      findings,
    }
  }

  if (isIndexPage(text)) {
    add('warn', 'pointer-guide', 1, `这像是一份索引页（链到 ${(String(text).match(/\]\([^)]*\.md\)/g) ?? []).length} 份文档），不是一份方案——逐份看它指向的文档`)
    return {
      ok: true,
      checked: { criteria: 0, lines: lines.length, genre: 'index' },
      errors: 0,
      warnings: findings.length,
      findings,
    }
  }

  if (isReferenceDoc(text)) {
    // 参考文档的三条：一句话说清它是什么；指向它描述的实现；写出公开面（服务/事件/类型）。
    const body = lines.slice(lines.findIndex(line => /^#\s+\S/.test(line)) + 1).join('\n')
    // 跳过两行样板：语言切换行（English | [中文](…)）与 Source: 行——它们在真实参考文档里
    // 就排在标题下面，第一版把语言切换行当成「第一段」，于是 47 份全被判没有定义。
    const BOILER = /^(?:English\s*\||Source:|源码：|>|\[中文\])/
    // 只看第一个二级标题之前的内容：定义段在标题区，不在正文深处。第一版从全文找
    // 第一个「不像标题」的段落，于是在删掉定义段之后，把 `## The service` 下面那句
    // 当成定义，summary-missing 永远不响。
    const head = body.split(/\n#{2,6}\s/)[0]
    const firstParagraph = head
      .split(/\n\s*\n/)
      .map(block => block.trim())
      .find(block => block && !block.startsWith('#') && !BOILER.test(block)) ?? ''
    if (firstParagraph.length < 40) {
      add('error', 'summary-missing', 0, '标题后面没有一句定义（一句「它是什么」）——参考文档的第一段就是它的定义')
    }
    if (!SOURCE_LINK.test(String(text))) {
      add('warn', 'source-missing', 0, '没有指向实现的路径或链接（认得：Source: `packages/…`）——参考文档不指明它在描述哪份代码，读者只能猜')
    }
    const idents = (String(text).match(IDENT_DENSITY) ?? []).length
    if (idents < 3) {
      add('error', 'surface-missing', 0, '没有写出公开面（类型名、服务名、事件名至少三个代码标识符）——没有标识符的「参考」没有可对照的东西')
    }
    const order = { error: 0, warn: 1 }
    findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
    const errors = findings.filter(finding => finding.level === 'error').length
    return {
      ok: errors === 0,
      checked: { criteria: 0, lines: lines.length, genre: 'reference' },
      errors,
      warnings: findings.length - errors,
      findings,
    }
  }

  // Problem: what this is for.
  const hasProblem = lines.some(line => PROBLEM_HEADING.test(`\n${line}`)) || lines.some(line => PROBLEM_LINE.test(line))
  if (!hasProblem) add('error', 'problem-missing', 0, '没有背景/问题/目标段——读者不知道这个方案在解决什么')

  // Acceptance criteria: the part a reviewer can check afterwards.
  const criteria = criteriaItems(text)
  const hasCriteriaHeading = lines.some(line => CRITERIA_HEADING.test(`\n${line}`)) || lines.some(line => CRITERIA_LINE.test(line))
  if (!hasCriteriaHeading && criteria.length === 0) {
    add('error', 'criteria-missing', 0, '没有验收标准（认得：## 验收标准 / ## Definition of Done + 条目）——没有验收标准的方案无法判定做完了没有')
  } else if (criteria.length < minCriteria) {
    add('warn', 'criteria-thin', criteria[0]?.line ?? 0, `验收标准只有 ${criteria.length} 条（下限 ${minCriteria}）——一条通常覆盖不了正常与异常两条路径`)
  }

  // The rule that earns the package: a criterion must be verifiable.
  for (const item of vagueCriteria(criteria)) {
    const word = VAGUE.find(candidate => item.text.toLowerCase().includes(candidate))
    add('error', 'criteria-vague', item.line, `第 ${item.line} 行验收标准含「${word}」但没有数字或可观测对象——「${item.text.slice(0, 24)}」既无法通过也无法拒绝`)
  }

  // Out of scope: the half of a spec that prevents scope creep.
  const hasOutOfScope = lines.some(line => OUT_OF_SCOPE_HEADING.test(`\n${line}`)) || lines.some(line => OUT_OF_SCOPE_LINE.test(line))
  if (requireOutOfScope && !hasOutOfScope) {
    add('error', 'out-of-scope-missing', 0, '没有「不做/范围外」段（认得：## 不做、## 非目标、Out of scope）——没写边界的方案在评审时会被无限扩大')
  }

  // Open questions: honest, but they must be listed rather than buried.
  const hasOpen = lines.some(line => OPEN_Q_HEADING.test(`\n${line}`))
  if (hasOpen) {
    const headingIndex = lines.findIndex(line => OPEN_Q_HEADING.test(`\n${line}`))
    const after = lines.slice(headingIndex + 1).filter(line => line.trim() !== '')
    const nextHeading = after.findIndex(line => /^#{1,6}\s/.test(line))
    const body = (nextHeading === -1 ? after : after.slice(0, nextHeading)).filter(line => /^\s*(?:[-*+]\s+|\d+\s*[.、)）]\s*)\S/.test(line))
    if (body.length === 0) add('warn', 'open-questions-empty', headingIndex + 1, '有「待定/开放问题」标题但下面没有条目——留个空标题比不写更让人困惑')
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked: { criteria: criteria.length, lines: lines.length, genre: 'proposal' },
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/spec-doc-check/api'
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
      return send(200, lintSpecDoc(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
