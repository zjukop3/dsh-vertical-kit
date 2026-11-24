// An ops runbook is decidable from the markdown: what you must have before you
// start, numbered steps you can follow under stress, how to undo it, and how to
// tell it worked. This verifies exactly those — and flags a destructive command
// that sits in a numbered step with no warning beside it.

export const name = 'ops-runbook-check'
export const inject = ['webServer']

// 真实 runbook 把这一段叫 Pre-flight（mulch）、Safety rules（devlovers）、
// Before you start、Preconditions。只认「前置/准备/prerequisites」会把两份真实
// runbook 全部判成「没有前置」——2026-11-20 实测 2/2 误报。
// 第二体裁：**开发配方**（DSH 的 cookbook：往 monorepo 里加一个包、加一个设置卡片）。
// 它假设读者已经在这份仓库里——「前置条件」是隐含的，回滚是 `git checkout`，
// 也没有生产环境可炸。对它要求「前置/回滚」，等于要求「改代码之前先备份仓库」。
// 判据：标题写 cookbook/recipe/how to add，或者正文里出现 monorepo 路径 + 编号步骤。
// 第三体裁：**参考/目录页**（DSH 的 adding-a-tool.md「Tool authoring reference」、
// extension-cookbook.md「各种插件形态的目录」）。它们按「形态」分节，不按「步骤」分节——
// 对它们问「第 3 步是什么」等于问一本字典「第 3 步是什么」。
// 判据：四个以上二级小节、零编号步骤、两个以上代码块。
export function isReferenceCatalog(text) {
  const source = String(text)
  const sections = (source.match(/^##\s+\S/gm) ?? []).length
  const fences = (source.match(/^```/gm) ?? []).length / 2
  const steps = (source.match(/^(?:\s*\d+[.、)）]\s+\S|#{1,6}\s*\d+[.、)）]\s+\S)/gm) ?? []).length
  return sections >= 4 && steps === 0 && fences >= 1
}

const RECIPE_TITLE = /(?:^|\n)#{1,6}[^\n]*(?:cookbook|recipe|how to (?:add|build|write|create)|配方|做法)/i
const MONOREPO_HINT = /\b(?:monorepo|pnpm-workspace|packages\/[a-z0-9-]+\/|\.tsx?\b)/i

const PREREQ_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:前置|先决|准备|依赖|注意|安全|prerequisit|preconditions?|pre-?flight|before you start|requirements|safety|guardrails?|required configuration|setup)/i
const PREREQ_LINE = /^[^\n]*(?:前置条件[：:，\s]|先决条件[：:，\s]|需要先|prerequisites?[：:\s])/i
// 判据是「文档里有真的会改变环境的命令」。标题里出现「Upgrade Posture」不算
// ——zoom 的 preflight 就是这种，它不改任何东西，自然也没有回滚可言。
const CHANGE_VERB =
  /\b(?:kubectl\s+(?:apply|delete|rollout)|terraform\s+(?:apply|destroy)|helm\s+(?:install|upgrade)|npm\s+publish|docker\s+push|systemctl\s+(?:restart|stop)|alembic\s+upgrade|prisma\s+migrate|flyway\s+migrate|git\s+push|scp\s|rsync\s)|部署|上线|发布|迁移|升级到|重启/i
const ROLLBACK_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:回滚|回退|撤销|rollback|revert|rolling back)/i
const ROLLBACK_LINE = /^[^\n]*(?:回滚[：:，\s]|回退[：:，\s]|rollback[：:\s]|rolling back)/i
// 真实 runbook 把验证叫 Post-release sanity（seeds）、Quick Probes（zoom）、
// health check、smoke test。只认「验证/确认/verify」会漏掉这些。
const VERIFY_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:验证|确认|检查结果|健康检查|verify|validation|sanity|health\s?check|smoke|probe|post-?(?:release|deploy))/i
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

  if (isReferenceCatalog(text)) {
    add('warn', 'reference-not-runbook', 1, '这是参考/目录页（按形态分节、没有编号步骤），不是一份运维手册——它的读者在查契约，不在照着做')
    const orderEarly = { error: 0, warn: 1 }
    findings.sort((a, b) => orderEarly[a.level] - orderEarly[b.level] || a.line - b.line)
    return { ok: true, checked: { steps: 0, lines: lines.length, genre: 'reference' }, errors: 0, warnings: findings.length, findings }
  }

  const recipe = RECIPE_TITLE.test(text) || (MONOREPO_HINT.test(text) && numberedSteps(text).length >= 3)

  // Prerequisites: what you must have in hand before starting.
  const hasPrereq = lines.some(line => PREREQ_HEADING.test(`\n${line}`)) || lines.some(line => PREREQ_LINE.test(line))
  if (!hasPrereq && !recipe) add('error', 'prereq-missing', 0, '没有前置条件段（认得：## 前置条件、需要先…、Prerequisites）——没有前置的手册让人在半路发现缺权限')

  // Steps: numbered, because a runbook is followed one line at a time.
  const steps = numberedSteps(text)
  if (steps.length === 0) {
    add('error', 'steps-missing', 0, '没有编号步骤（认得：1. …、2. …，或 ## 1. … 这样的编号标题）——散文式手册在压力下无法照着做')
  } else if (steps.length < minSteps) {
    add('warn', 'steps-thin', steps[0].line, `编号步骤只有 ${steps.length} 条（下限 ${minSteps}）——步骤越少，读者越要自己补判断`)
  }

  // Destructive commands need a warning in the same line. This is the rule
  // that earns the package: an unnoticed rm -rf in step 4 is the incident.
  steps.forEach((step, index) => {
    // The command and its warning are looked for in the step as a whole: a
    // numbered heading's command sits in the body under it.
    const stepBody = `${step.text}\n${step.body ?? ''}`
    // 「先备份、再删」是真实 runbook 的常态：备份写在**上一步**，删除写在这一步。
    // 只看当行会把 timefusion 那种写法判成「没有警示」——2026-11-20 实测误报。
    const near = [steps[index - 1], steps[index], steps[index + 1]]
      .filter(Boolean)
      .map(entry => `${entry.text}\n${entry.body ?? ''}`)
      .join('\n')
    for (const { pattern, what } of DESTRUCTIVE) {
      if (pattern.test(stepBody) && !WARNING_NEARBY.test(stepBody) && !WARNING_NEARBY.test(near)) {
        add('error', 'destructive-unwarned', step.line, `第 ${step.line} 行起的步骤含 ${what} 但没有写明注意/备份/不可逆——这条命令在压力下会被照抄`)
      }
    }
  })

  // Rollback: how to undo it.
  const hasRollback = lines.some(line => ROLLBACK_HEADING.test(`\n${line}`)) || lines.some(line => ROLLBACK_LINE.test(line))
  // 回滚只对「会改变环境」的 runbook 有意义：部署、迁移、升级、发布。
  // 纯演练/前置检查类（zoom 的 preflight）没有可回滚的对象，问它回滚等于问
  // 「读一遍文档怎么回滚」。2026-11-20 实测：不加这个条件，纯检查类必报。
  const doesChange = CHANGE_VERB.test(text)
  if (requireRollback && doesChange && !hasRollback && !recipe) {
    add('error', 'rollback-missing', 0, '没有回滚段（认得：## 回滚、回滚：…、Rollback）——这份 runbook 会改变环境，出问题时读者没有退路')
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
    checked: { steps: steps.length, lines: lines.length, genre: recipe ? 'recipe' : 'runbook' },
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
      const text = typeof body.text === 'string' && body.text ? body.text : body.path ? await (await import('node:fs/promises')).readFile(body.path, 'utf8') : ''
      if (!text) return send(400, { error: 'text or path is required' })
      return send(200, lintOpsRunbook(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
