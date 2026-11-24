// A bug report is decidable from the markdown: what the environment is, some
// way to reproduce it, and what was expected versus what happened.
//
// 这一版是被 404 份真实的 GitHub bug issue 打回来的（2026-11-24：microsoft/vscode、
// elastic/kibana、pandas、TypeScript、deno、home-assistant 等仓库的 label:bug）。
// 旧版判据下只有 2% 通过：88% 报「没有环境」、86% 报「没有复现步骤」。那不是 88% 的
// 真实报告都写坏了，是判据在量拼写：
//
//   · 真实报告的段名是 `**Steps**`、`## Cause`、`### Environment` 混着来，而旧版只认
//     `#` 开头的标题，加粗标签一个都看不见；
//   · 复现常常是「一段编号 + 一个能跑的代码块 + 一个最小复现链接」的任意组合，
//     旧版只数「标题之后紧跟的编号行」；
//   · 环境信息常写成 `- VS Code: 1.92.0`、`Platform: darwin`、`commit abc1234`，
//     旧版只认行首的 `版本：`/`OS：`；
//   · 「预期/实际」常写成 `Expected: …`、`should … but …`、`预期…却…`，
//     旧版只认行首标签。
//
// 判据改成量性质：环境证据（版本号/平台/commit）、可复现证据（编号步骤、命令、
// 代码块、最小复现链接，任一）、以及「这里不对」的证据（预期-实际对照，或
// 错误/崩溃/失败这类坏掉的说法）。没有对照只有「坏了」时降级为 warn——
// 真实报告大量这么写，把它判成 error 就是让别人关掉这个检查。

export const name = 'bug-report-check'
export const inject = ['webServer']

const TITLE_FIRST = /^#\s+\S/

// 段名统一成小写、去掉 # 与 ** 与尾部冒号后再比。`**Steps**`、`### 复现步骤:`、`- 环境`
// 都要落到同一批标签上。
export const labelOf = line =>
  String(line)
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*+]\s+/, '')
    // 冒号后面是值，不是名字：`Platform: darwin` 的段名是 platform。
    .replace(/[：:][^]*$/, '')
    .trim()
    .toLowerCase()

const STEPS_LABEL =
  /^(?:steps?(?: to reproduce)?|repro(?:duction)? steps?|how to reproduce|to reproduce|reproduction|复现(?:步骤|过程|方式)?|重现步骤|操作步骤|步骤|最小复现)$/
const ENV_LABEL =
  /^(?:environment|env|system info|version info|version|platform|os|system|build|版本|环境|系统|系统信息|运行环境|平台|构建)$/
const EXPECTED_LABEL = /^(?:expected(?: behavior| result| outcome)?|expectation|should|预期(?:行为|结果)?|期望(?:结果)?|应该)$/
const ACTUAL_LABEL =
  /^(?:actual(?: behavior| result| outcome)?|what happens|what happened|got|instead|实际(?:行为|结果)?|现状|结果|我遇到)$/

const LIST_ITEM = /^\s*(?:\d+\s*[.、)）]|[-*+]\s+)\s*\S/
const FENCE = /^\s*(?:```|~~~)/
// 命令的两种写法：代码块里带提示符（`$ npm i`、`> node x`），或者正文里反引号包住的命令。
// `#` 不能算提示符——markdown 标题也长这样，`# bug` 会被当成一条能跑的命令。
const TOOL = '[a-z][a-z0-9-]*'
const KNOWN_TOOL =
  '(?:npm|pnpm|yarn|npx|node|deno|bun|cargo|go|python3?|pip3?|uv|curl|wget|docker|docker-compose|make|cmake|git|dotnet|mvn|gradle|kubectl|helm|terraform|brew)'
const COMMAND_IN_FENCE = new RegExp(`^\\s*(?:\\$|>)\\s*\\S|${KNOWN_TOOL}\\s+\\S`)
const COMMAND_INLINE = new RegExp(`\`\\s*${KNOWN_TOOL}\\b[^\`]*\``)
const CODE_HINT = /(?:<[a-z][\w-]*[\s>]|\bfunction\b|\bconst\b|\blet\b|\bimport\s|\bclass\s|=>|;\s*$|\{\s*$|^\s*[}\])])/
const REPRO_LINK =
  /https?:\/\/(?:codesandbox\.io|stackblitz\.com|replit\.(?:com|dev)|jsfiddle\.net|gist\.github\.com|play\.vscode\.dev|asciinema\.org|([a-z0-9-]+\.)*github\.com\/[^\s/]+\/[^\s/]+\/(?:issues|pull)\/\d+)/i
const VERSION = /\bv?\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?\b/
// 版本号的语境不必是白名单里的产品名：真实写法是 `vite 5.4.2`、`node 20.11`、
// `vscode 1.92.0`——「一个小写词 + 空格 + 版本号」已经足够说明这是某个软件的版本。
// 只写数字（`1.2.3` 单独出现）不算，那可能只是编号。
const NAME_VERSION = /\b[a-z][\w.+-]{1,24}\s+v?\d+\.\d+(?:\.\d+)?\b/i
const VERSION_CONTEXT =
  /(?:version|版本|vscode|vs\s?code|electron|node|deno|bun|python|chrome|chromium|firefox|safari|edge|macos|osx|windows|win(?:10|11)|ubuntu|debian|fedora|linux|android|ios|commit|build|platform|arch|runtime|sdk|系统|平台|环境)/i
const COMMIT = /\bcommit[:\s]+[0-9a-f]{7,40}\b|\b[0-9a-f]{40}\b/i
const WRONGNESS =
  /(?:error|exception|crash(?:es|ed|ing)?|fails?|failed|failing|breaks?|broken|throws?|threw|incorrect|wrong|unexpected|regression|does\s?n[o']t\s+work|not\s+working|bug|报错|失败|崩(?:溃|了)?|异常|错误|不对|不对头|无法|卡住|没反应)/i

// 编号/列表步骤：只在「步骤类标签之后、下一个标签之前」数。真实报告里标签可能是加粗、
// 也可能是 `Steps to reproduce:` 这样的一行，所以判据看标签而不是看标题层级。
export function reproSteps(text) {
  const lines = text.split('\n')
  let inSteps = false
  const steps = []
  lines.forEach((line, index) => {
    const label = labelOf(line)
    const isLabel = label !== '' && (STEPS_LABEL.test(label) || ENV_LABEL.test(label) || EXPECTED_LABEL.test(label) || ACTUAL_LABEL.test(label))
    if (isLabel) {
      inSteps = STEPS_LABEL.test(label)
      return
    }
    // `Steps to reproduce:` 后面直接跟散文也算标签行
    if (/steps? to reproduce|复现步骤|复现过程|重现步骤|操作步骤/i.test(line) && !LIST_ITEM.test(line)) {
      inSteps = true
      return
    }
    if (inSteps && LIST_ITEM.test(line)) steps.push({ line: index + 1, text: line.trim() })
  })
  return steps
}

// 步骤也能不挂在标签下：真实报告常写「### Problem」然后两句散文，
// 或者干脆一串 bullet 没有段名。
const ACTION_WORD =
  /(?:\b(?:open|opened|click|select|type|type[d]?|press|run|start|set|toggle|switch|change|close|reload|restart|navigate|hover|drag|paste|import|install|enable|disable|create|delete|add|remove|enter|paste)\b|打开|点击|选择|输入|按下|运行|启动|设置|切换|关闭|刷新|重启|进入|拖|粘贴|导入|安装|启用|禁用|新建|删除|添加|移除)/gi
const SEQUENCE_WORD = /\b(?:then|after that|afterwards|next|finally)\b|(?:然后|接着|之后|随后|再|最后)/i

export function proseSequence(text) {
  const paragraphs = String(text).split(/\n\s*\n/)
  for (const [index, paragraph] of paragraphs.entries()) {
    const trimmed = paragraph.trim()
    if (trimmed === '' || LIST_ITEM.test(trimmed) || FENCE.test(trimmed)) continue
    const actions = new Set((trimmed.match(ACTION_WORD) ?? []).map(word => word.toLowerCase()))
    if (actions.size >= 2 || (actions.size >= 1 && SEQUENCE_WORD.test(trimmed) && trimmed.length > 80)) {
      return { kind: 'prose', steps: actions.size, line: 0, paragraph: index }
    }
  }
  return null
}

export function listItems(text) {
  let inFence = false
  const items = []
  for (const [index, line] of String(text).split('\n').entries()) {
    if (FENCE.test(line)) {
      inFence = !inFence
      continue
    }
    if (!inFence && LIST_ITEM.test(line)) items.push({ line: index + 1, text: line.trim() })
  }
  return items
}

// 可复现证据：编号步骤 / 能跑的命令 / 代码块 / 最小复现链接 / 写了先后动作的散文，
// 五选一即成立。
export function reproEvidence(text) {
  const steps = reproSteps(text)
  if (steps.length > 0) return { kind: 'steps', steps: steps.length, line: steps[0].line }
  const lines = text.split('\n')
  let inFence = false
  for (const [index, line] of lines.entries()) {
    if (FENCE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence && COMMAND_IN_FENCE.test(line)) return { kind: 'command', steps: 0, line: index + 1 }
  }
  for (const [index, line] of lines.entries()) {
    if (FENCE.test(line)) continue
    if (COMMAND_INLINE.test(line)) return { kind: 'command', steps: 0, line: index + 1 }
    if (REPRO_LINK.test(line)) return { kind: 'link', steps: 0, line: index + 1 }
  }
  // 没有段名的列表：两份以上操作项就算步骤。`- Open the dialog` / `- close it` 就是复现。
  const items = listItems(text)
  if (items.length >= 2) return { kind: 'steps', steps: items.length, line: items[0].line }
  const prose = proseSequence(text)
  if (prose) return prose
  // 代码块里没有命令时，只要有代码本身（HTML 片段、函数体）也算能照着做的东西。
  let fence = null
  for (const [index, line] of lines.entries()) {
    if (FENCE.test(line)) {
      if (fence === null) fence = index
      else return { kind: 'snippet', steps: 0, line: fence + 1 }
      continue
    }
    if (fence !== null && CODE_HINT.test(line)) return { kind: 'snippet', steps: 0, line: fence + 1 }
  }
  return { kind: 'none', steps: 0, line: 0 }
}

// 环境证据：版本号（带上下文）/ commit / 平台标签行。
export function envEvidence(text) {
  const lines = text.split('\n')
  for (const [index, line] of lines.entries()) {
    const label = labelOf(line)
    if (ENV_LABEL.test(label)) {
      // `Platform: darwin` 值在同一行；`## 环境` 那种空段名要往下看三行。
      const inlineValue = line.replace(/^[^：:]*[：:]/, '').trim()
      if (ENV_LABEL.test(label) && inlineValue !== '' && inlineValue !== line.trim()) return { kind: 'label', line: index + 1 }
      const next = lines.slice(index + 1, index + 4).find(candidate => candidate.trim() !== '')
      if (next && next.trim() !== '') return { kind: 'label', line: index + 1 }
      continue
    }
    // 表单式字段：段名是一句问句（`### What version of X has the issue?`），值在下一行。
    if (/version|版本|build|commit|platform|环境|系统/i.test(line)) {
      const next = lines.slice(index + 1, index + 4).find(candidate => candidate.trim() !== '')
      if (next && VERSION.test(next)) return { kind: 'version', line: index + 2 }
    }
    if (COMMIT.test(line)) return { kind: 'commit', line: index + 1 }
    if (VERSION.test(line) && (VERSION_CONTEXT.test(line) || NAME_VERSION.test(line))) return { kind: 'version', line: index + 1 }
    // 多行写法：`Version` 标签在上一行，值在下一行
    if (ENV_LABEL.test(labelOf(lines[index - 1] ?? '')) && VERSION.test(line)) return { kind: 'version', line: index + 1 }
  }
  return { kind: 'none', line: 0 }
}

// 预期 vs 实际：显式对照（标签或 should…but… 句式），或者只有「坏了」的说法。
export function expectationEvidence(text) {
  const lines = text.split('\n')
  let expected = 0
  let actual = 0
  for (const [index, line] of lines.entries()) {
    const label = labelOf(line)
    if (EXPECTED_LABEL.test(label)) expected = expected || index + 1
    if (ACTUAL_LABEL.test(label)) actual = actual || index + 1
    if (/\bexpected\b[^.\n]{2,160}\b(?:actual|got|but|instead|however)\b/i.test(line)) expected = expected || index + 1
    if (/(?:预期|期望|应该)[^\n]{2,160}(?:实际|却|但是|结果)/.test(line)) expected = expected || index + 1
    if (/\bshould\b[^.\n]{2,160}\b(?:but|instead|however|yet)\b/i.test(line)) expected = expected || index + 1
  }
  return { expected, actual, wrongness: WRONGNESS.test(text) }
}

export function lintBugReport(text, rules = {}) {
  const minSteps = rules.minSteps ?? 3
  // 两种用法，判据必须分开，否则一定有一边被冤枉：
  //   review（默认，看别人的报告）：只有「读不出这是 bug」和「完全没法用」算 error；
  //     环境缺失、没写预期/实际、没写步骤都只是 warn——真实报告大量这样，
  //     判 error 等于让人关掉这个检查；
  //   strict（提交前给自己的报告过一遍）：这几条全部升级为 error。
  const strict = rules.strict === true
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')

  const env = envEvidence(text)
  const repro = reproEvidence(text)
  const expectation = expectationEvidence(text)

  // 「没法用」的判据不是字数，而是三件事同时缺席：没有有效正文、没有环境证据、
  // 没有可复现的证据。写成一句话但带着 `npm test` 和版本号的报告是有用的，
  // 按字数判会把它们冤枉掉。
  const meaningful = lines
    .filter(line => {
      if (/^\s*#{1,6}\s/.test(line)) return false
      const label = labelOf(line)
      if (label !== '' && (STEPS_LABEL.test(label) || ENV_LABEL.test(label) || EXPECTED_LABEL.test(label) || ACTUAL_LABEL.test(label))) return false
      return line.trim() !== ''
    })
    .join(' ')
  const emptySubmission = meaningful.trim().length < 60 && env.kind === 'none' && repro.kind === 'none'
  const missing = (rule, line, message) => add(strict || emptySubmission ? 'error' : 'warn', rule, line, message)

  // 标题：报告的一句话摘要。
  if (!TITLE_FIRST.test(text)) add('error', 'title-missing', 1, '第一行没有 `# 标题`——报告需要一行能看懂的一句话')

  if (env.kind === 'none') {
    missing('env-missing', 0, '没有环境证据（认得：版本号 1.92.0、## 环境、Platform: darwin、commit abc1234）——没有环境的 bug 无法归因')
  }

  if (repro.kind === 'none') {
    add(strict || emptySubmission ? 'error' : 'warn', 'repro-missing', 0, '没有可复现的证据（认得：编号步骤、能跑的命令、代码片段、最小复现链接、写了先后动作的散文）——没有这些东西的 bug 很难验证')
  } else if (repro.kind === 'steps' && repro.steps < minSteps) {
    add('warn', 'repro-thin', repro.line, `复现步骤只有 ${repro.steps} 步（下限 ${minSteps}）——步骤越少，能复现的人越少`)
  }

  if (!expectation.expected && !expectation.actual) {
    // 只有「坏了」没有对照：真实报告里非常常见（「点这里就报错」），
    // 判 error 等于逼人补一句套话。有坏掉的证据就给 warn，什么都没有才是 error。
    if (expectation.wrongness) {
      add(strict ? 'error' : 'warn', 'expectation-unstated', 0, '没有「预期 vs 实际」的对照（认得：Expected:/Actual:、预期…却…、should…but…）——写了「坏了」但没写本该怎样')
    } else if (strict) {
      add('error', 'expectation-unstated', 0, '既没有「预期 vs 实际」的对照，也没有任何「这里不对」的说法——读不出这为什么是 bug')
    } else {
      add('warn', 'expectation-unstated', 0, '没写「预期 vs 实际」两行（模板会要求）；正文里看起来描述的是坏结果，但对照能省掉读者的猜测')
    }
  } else if (!expectation.expected) {
    missing('expected-missing', expectation.actual, '有「实际」没有「预期」——预期行为写出来，读者才知道差在哪')
  } else if (!expectation.actual) {
    missing('actual-missing', expectation.expected, '有「预期」没有「实际」——实际发生了什么，读者才知道差在哪')
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    mode: strict ? 'strict' : 'review',
    checked: {
      steps: repro.kind === 'steps' ? repro.steps : 0,
      repro: repro.kind,
      env: env.kind,
      emptySubmission,
      expectedActual: expectation.expected && expectation.actual ? 'pair' : expectation.expected ? 'expected-only' : expectation.actual ? 'actual-only' : expectation.wrongness ? 'wrongness-only' : 'none',
      lines: lines.length,
    },
    errors,
    warnings: findings.length - errors,
    findings,
  }
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