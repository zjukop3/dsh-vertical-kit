// An ops runbook is decidable from the markdown: what you must have before you
// start, numbered steps you can follow under stress, how to undo it, and how to
// tell it worked. This verifies exactly those — and flags a destructive command
// that sits in a numbered step with no warning beside it.

export const name = 'ops-runbook-check'
export const inject = ['webServer']

const PREREQ_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:前置|先决|准备|依赖|prerequisit|before you start|requirements)/i
const PREREQ_LINE = /^[^\n]*(?:前置条件[：:，\s]|先决条件[：:，\s]|需要先|prerequisites?[：:\s])/i
const ROLLBACK_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:回滚|回退|撤销|rollback|revert)/i
const ROLLBACK_LINE = /^[^\n]*(?:回滚[：:，\s]|回退[：:，\s]|rollback[：:\s])/i
const VERIFY_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:验证|确认|检查结果|verify|validation)/i
const VERIFY_LINE = /^[^\n]*(?:验证[：:，\s]|确认[：:，\s]|verify[：:\s])/i
const STEP_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:步骤|操作|流程|steps?|procedure)/i

// Commands whose blast radius deserves a warning in the same step. The list is
// deliberately short: each of these has removed data for somebody.
const DESTRUCTIVE = [
  { pattern: /\brm\s+-[a-z]*[rf]/i, what: 'rm -rf' },
  { pattern: /\bdrop\s+(?:table|database|schema)\b/i, what: 'DROP' },
  { pattern: /\btruncate\s+table\b/i, what: 'TRUNCATE' },
  { pattern: /\bdelete\s+from\b/i, what: 'DELETE' },
  { pattern: /\bkubectl\s+delete\b/i, what: 'kubectl delete' },
  { pattern: /\bterraform\s+(?:destroy|apply)\b/i, what: 'terraform apply/destroy' },
  { pattern: /\bgit\s+push\s+(?:-f|--force)\b/i, what: 'git push --force' },
  { pattern: /\bdocker\s+(?:rm|rmi|system\s+prune)\b/i, what: 'docker rm/prune' },
  { pattern: /\bmkfs\b|\bdd\s+if=/i, what: 'mkfs/dd' },
]
const WARNING_NEARBY = /(?:注意|警告|危险|不可逆|谨慎|确认|备份|warning|caution|danger|destructive|irreversible|back up|make sure)/i

// `## 3. 构建月报页` is a numbered step. It was not, until this check ran over
// this project's own two runbooks: both order their steps as numbered headings,
// which is every bit as followable as a numbered list, and both were reported as
// having no steps at all. A runbook is executed, not read — whichever shape the
// numbering takes.
const NUMBERED_HEADING = /^#{1,6}\s+\d+\s*[.、)）]\s*\S/

// Numbered steps in the whole document, as list items or as numbered headings.
// A numbered heading carries its section body, because the command that step
// performs lives under the heading, not in it.
export function numberedSteps(text) {
  const lines = String(text).split('\n')
  const out = []
  let inSteps = false
  lines.forEach((line, index) => {
    if (/^#{1,6}\s/.test(line)) {
      inSteps = STEP_HEADING.test(`\n${line}`)
      if (NUMBERED_HEADING.test(line)) {
        let end = lines.length
        for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
          if (/^#{1,6}\s/.test(lines[cursor])) { end = cursor; break }
        }
        out.push({ line: index + 1, text: line.trim(), body: lines.slice(index + 1, end).join('\n'), inSteps: true })
      }
      return
    }
    if (/^\s*\d+\s*[.、)）]\s*\S/.test(line)) {
      out.push({ line: index + 1, text: line.trim(), body: '', inSteps })
    }
  })
  return out
}

export function lintOpsRunbook(text, rules = {}) {
  const minSteps = rules.minSteps ?? 3
  const requireRollback = rules.requireRollback ?? true
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')

  // Prerequisites: what you must have in hand before starting.
  const hasPrereq = lines.some(line => PREREQ_HEADING.test(`\n${line}`)) || lines.some(line => PREREQ_LINE.test(line))
  if (!hasPrereq) add('error', 'prereq-missing', 0, '没有前置条件段（认得：## 前置条件、需要先…、Prerequisites）——没有前置的手册让人在半路发现缺权限')

  // Steps: numbered, because a runbook is followed one line at a time.
  const steps = numberedSteps(text)
  if (steps.length === 0) {
    add('error', 'steps-missing', 0, '没有编号步骤（认得：1. …、2. …，或 ## 1. … 这样的编号标题）——散文式手册在压力下无法照着做')
  } else if (steps.length < minSteps) {
    add('warn', 'steps-thin', steps[0].line, `编号步骤只有 ${steps.length} 条（下限 ${minSteps}）——步骤越少，读者越要自己补判断`)
  }

  // Destructive commands need a warning in the same line. This is the rule
  // that earns the package: an unnoticed rm -rf in step 4 is the incident.
  for (const step of steps) {
    // The command and its warning are looked for in the step as a whole: a
    // numbered heading's command sits in the body under it.
    const stepBody = `${step.text}\n${step.body ?? ''}`
    for (const { pattern, what } of DESTRUCTIVE) {
      if (pattern.test(stepBody) && !WARNING_NEARBY.test(stepBody)) {
        add('error', 'destructive-unwarned', step.line, `第 ${step.line} 行起的步骤含 ${what} 但没有写明注意/备份/不可逆——这条命令在压力下会被照抄`)
      }
    }
  }

  // Rollback: how to undo it.
  const hasRollback = lines.some(line => ROLLBACK_HEADING.test(`\n${line}`)) || lines.some(line => ROLLBACK_LINE.test(line))
  if (requireRollback && !hasRollback) {
    add('error', 'rollback-missing', 0, '没有回滚段（认得：## 回滚、回滚：…、Rollback）——出问题时读者没有退路')
  }

  // Verification: how to tell it worked.
  const hasVerify = lines.some(line => VERIFY_HEADING.test(`\n${line}`)) || lines.some(line => VERIFY_LINE.test(line))
  if (!hasVerify) add('error', 'verify-missing', 0, '没有验证段（认得：## 验证、确认：…、Verify）——没写怎么确认，读者不知道做完了没有')

  // A runbook that assumes a shell should say which one, but that is a nit
  // worth a warning only when it also contains commands that differ per shell.
  const hasShellHint = lines.some(line => /(?:bash|zsh|sh\b|powershell|cmd\.exe|shell)/i.test(line))
  if (!hasShellHint) add('warn', 'shell-unspecified', 0, '没有说明用什么 shell（认得：bash、zsh、PowerShell）——同一条命令在不同 shell 里行为不同')

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked: { steps: steps.length, lines: lines.length },
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/ops-runbook-check/api'
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
      return send(200, lintOpsRunbook(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
