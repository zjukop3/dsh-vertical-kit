// A bug report is decidable from the markdown: what the environment is, how
// to reproduce it step by step, what was expected, and what happened instead.
// This verifies exactly those and names the missing section.

export const name = 'bug-report-check'
export const inject = ['webServer']

const ENV_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:环境|environment|系统信息|version info)/i
const ENV_LINE = /^[^\n]*(?:版本[：:]\s*\S|环境[：:]|os[：:]|系统[：:]|node[：:]\s*v?\d)/i
const REPRO_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:复现|重现|步骤|repro|steps to reproduce)/i
const EXPECTED_LINE = /^[^\n]*(?:预期|期望|expected)/i
const ACTUAL_LINE = /^[^\n]*(?:实际|当前结果|actual|got)/i
const TITLE_FIRST = /^#\s+\S/

// Numbered steps inside a 复现/Steps section — one numbered line is a step,
// three is a recipe. Prose descriptions without numbers read as narrative,
// not steps.
export function reproSteps(text) {
  const lines = text.split('\n')
  let inRepro = false
  const steps = []
  lines.forEach((line, index) => {
    if (/^#{1,6}\s/.test(line)) {
      inRepro = REPRO_HEADING.test(`\n${line}`)
      return
    }
    if (inRepro && /^\s*(?:\d+\s*[.、)）]|[-*+]\s+)\s*\S/.test(line)) steps.push({ line: index + 1, text: line.trim() })
  })
  return steps
}

export function lintBugReport(text, rules = {}) {
  const minSteps = rules.minSteps ?? 3
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')

  // Title: the first heading must not be empty — the report's one-line summary.
  if (!TITLE_FIRST.test(text)) add('error', 'title-missing', 1, '第一行没有 `# 标题`——报告需要一行能看懂的一句话')

  // Environment: a heading or self-identifying line with version-ish content.
  const hasEnv = lines.some(line => ENV_HEADING.test(`\n${line}`)) || lines.some(line => ENV_LINE.test(line))
  if (!hasEnv) add('error', 'env-missing', 0, '没有环境信息（认得：## 环境、版本：x.y.z、OS：…、Node：v…）——没有环境的 bug 无法归因')

  // Reproduction: numbered steps inside a 复现/Steps section.
  const steps = reproSteps(text)
  if (steps.length === 0) add('error', 'repro-missing', 0, '没有复现步骤（认得：## 复现步骤 + 编号步骤）——没有步骤的 bug 无法验证')
  else if (steps.length < minSteps) add('warn', 'repro-thin', steps[0].line, `复现步骤只有 ${steps.length} 步（下限 ${minSteps}）——步骤越少，能复现的人越少`)

  // Expected vs actual: the two lines that make a bug a bug.
  const hasExpected = lines.some(line => EXPECTED_LINE.test(line))
  const hasActual = lines.some(line => ACTUAL_LINE.test(line))
  if (!hasExpected && !hasActual) add('error', 'expected-actual-missing', 0, '没有「预期」与「实际」的对照（认得：预期：…、实际：…、Expected/Actual）——没有对照就不是 bug 描述')
  else if (!hasExpected) add('error', 'expected-missing', 0, '有「实际」没有「预期」——预期行为写出来，读者才知道差在哪')
  else if (!hasActual) add('error', 'actual-missing', 0, '有「预期」没有「实际」——实际发生了什么，读者才知道差在哪')

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, checked: { steps: steps.length, lines: lines.length }, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/bug-report-check/api'
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
      return send(200, lintBugReport(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
