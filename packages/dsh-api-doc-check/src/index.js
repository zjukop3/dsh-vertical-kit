// API documentation is decidable from the markdown: every endpoint named with
// its method and path, a request example, a response example, and the auth
// model stated once. This verifies exactly those and names the endpoint that
// is missing its half.

export const name = 'api-doc-check'
export const inject = ['webServer']

// An endpoint line: `GET /v1/items`, `POST /v1/items`, `DELETE /v1/items/{id}`.
// Bare paths without a method are not counted — a path alone cannot be called.
export function endpoints(text) {
  const out = []
  text.split('\n').forEach((line, index) => {
    const match = line.match(/\b(get|post|put|patch|delete|head|options)\s+(\/\S+|`\S+`)/i)
    if (match) out.push({ line: index + 1, method: match[1].toUpperCase(), path: match[2].replace(/`/g, ''), text: line.trim() })
  })
  return out
}

// 第二体裁：**库/类型参考**（DSH 的 cordis-api/：一个类、它的成员、每个成员的签名块）。
// 它不是 HTTP 接口——问它「GET 哪个路径」等于问一本类库手册它的 URL。判据：有签名块
// （```ts 里出现 class/interface/function/public/declare），且没有 METHOD + 路径。
const SIGNATURE_BLOCK = /```(?:ts|tsx|typescript|js)\b[\s\S]{0,600}?\b(?:class|interface|function|public|declare|export)\b/i
const ENDPOINT_LINE = /^\s*(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//m

export function isLibraryReference(text) {
  const source = String(text)
  if (ENDPOINT_LINE.test(source)) return false
  // 成员级参考（cordis-api 的每份都是这种）：`### member` + 签名块。
  const members = (source.match(/^###\s+\S/gm) ?? []).length
  const fences = (source.match(/^```/gm) ?? []).length / 2
  // 架构参考（api-gateway.md）：正文 + 两个以上代码块，但没有成员小节。
  // 列表型参考（inherited.md）：一条一条列成员并指向源码文件，没有签名块也没有成员小节。
  const sourceLinks = (source.match(/\]\([^)]*\.(?:ts|tsx|js)\b/g) ?? []).length
  const bullets = (source.match(/^-\s+`/gm) ?? []).length
  // 成员小节本身就是强信号：一份列了两个以上成员、却没有签名也没有标识符的参考页，
  // 正是要报 signature-missing 的那种——第一版要求「成员小节 + 代码块」才算参考，
  // 于是这条规则永远打不到它该打的目标。
  return members >= 2
    || SIGNATURE_BLOCK.test(source)
    || (fences >= 2 && /\bthe\b[\s\S]{0,80}\bdescribes\b/i.test(source))
    || (sourceLinks >= 3 && bullets >= 8)
}

// 第三体裁：**目录表**（DSH 的 tool-catalog.md：一张表列全部工具，生成、不许手改）。
export function isCatalogPage(text) {
  const source = String(text)
  const rows = (source.match(/^\|\s/gm) ?? []).length
  return rows >= 8 && !ENDPOINT_LINE.test(source)
}

export function lintApiDoc(text, rules = {}) {
  const minEndpoints = rules.minEndpoints ?? 1
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')

  if (isCatalogPage(text)) {
    add('warn', 'reference-catalog', 1, '这是一份目录表（逐行列出条目），不是一份接口文档——每一行该去它自己的参考页')
    const orderC = { error: 0, warn: 1 }
    findings.sort((a, b) => orderC[a.level] - orderC[b.level] || a.line - b.line)
    return { ok: true, checked: { endpoints: 0, lines: lines.length, genre: 'catalog' }, errors: 0, warnings: findings.length, findings }
  }

  if (isLibraryReference(text)) {
    // 库参考的三条：自称是什么（标题下一段）、有签名块、指向实现。
    // 定义段只在第一个成员小节**之前**找：否则删掉定义之后，成员说明会被当成定义，
    // summary-missing 永不响（spec-doc 那边踩过同一个坑）。
    const headOnly = String(text).split(/\n#{2,6}\s/)[0]
    const body = headOnly.split(/\n\s*\n/).map(block => block.trim())
    const BOILER = /^(?:English\s*\||<!--|```|\[Source|Source:|源码：)/
    const firstProse = body.find(block => block && !block.startsWith('#') && !BOILER.test(block)) ?? ''
    if (firstProse.length < 40) add('error', 'summary-missing', 0, '标题后面没有一句「这个东西是什么」——库参考的第一段就是它的定义')
    // 「看得见形状」有两条路：代码块，或者行内标识符（inherited.md 用 `ctx.on` 这种
    // 一条条列出成员并链到源码）。只认代码块会把列表型参考判成空文档。
    const anyFence = (String(text).match(/^```/gm) ?? []).length / 2
    const inlineIdents = (String(text).match(/`[A-Za-z_$][\w.$()/-]*`/g) ?? []).length
    if (anyFence === 0 && inlineIdents < 5) add('error', 'signature-missing', 0, '既没有代码块也没有行内标识符——读者看不到它长什么样（签名、示例、成员名都行）')
    if (!/(?:Source|源码|实现见)[:：\s]|\]\([^)]*\.(?:ts|tsx|js)\b/.test(String(text))) {
      add('warn', 'source-missing', 0, '没有指向实现的路径（认得：[Source](../../vendor/…/service.ts)）——库参考不指明它在描述哪份代码')
    }
    const order = { error: 0, warn: 1 }
    findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
    const errors = findings.filter(finding => finding.level === 'error').length
    return { ok: errors === 0, checked: { endpoints: 0, lines: lines.length, genre: 'library' }, errors, warnings: findings.length - errors, findings }
  }

  const eps = endpoints(text)
  if (eps.length < minEndpoints) {
    add('error', 'endpoints-missing', 0, `没有「METHOD + 路径」形式的端点（认得：GET /v1/items、POST /v1/orders），下限 ${minEndpoints}——只有路径没有动词的行不算，单独一行路径无法被调用`)
  }

  // A fenced code block is the documented shape of a request or a response.
  const fences = (text.match(/```/g) || []).length
  if (fences < 2) {
    add('error', 'examples-missing', 0, `代码块只有 ${Math.floor(fences / 2)} 个（下限 1）——接口文档至少要有一个请求或响应示例`)
  }

  // Auth: how a caller proves identity, stated once somewhere.
  //
  // 两种真实写法不算缺失：一是明说「无需鉴权」；二是这份 API 只在本机/Unix socket 上
  // 监听——问它「怎么证明身份」等于问本机进程怎么证明自己是本机。2026-11-20 实测：
  // all-smi 的文档（unix socket + localhost）在这条上被误报。
  const AUTH_NONE = /(?:无需(?:鉴权|认证|授权)|不需要(?:鉴权|认证|授权)|不涉及鉴权|no auth(?:entication)?(?: required)?|unauthenticated)/i
  const LOOPBACK_ONLY = /(?:https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+|--unix-socket|unix:\/\/)/i
  const hasAuth =
    // 光有 `token` 不算鉴权说明：分页文档里到处是「下一段 token」。
    // 认的是能证明身份的那些写法（access token / bearer / api key / Authorization）。
    lines.some(line => /(?:鉴权|认证|授权|api[_\s-]?key|access[_\s-]?token|auth[_\s-]?token|bearer|authorization|auth\b)/i.test(line)) ||
    AUTH_NONE.test(text) ||
    LOOPBACK_ONLY.test(text)
  if (!hasAuth) add('error', 'auth-missing', 0, '全文没有鉴权说明（认得：鉴权、认证、Authorization、API key、Bearer，或明说无需鉴权 / 只在本机与 Unix socket 上监听）——不知道怎么证明身份的接口文档不可用')

  // Every documented error shape: a doc that only shows success leaves the
  // reader guessing what a failure looks like.
  const hasErrorShape = lines.some(line => /(?:错误|失败|error|4\d\d|5\d\d)/i.test(line))
  if (!hasErrorShape) add('warn', 'error-shape-missing', 0, '没有错误响应的说明（认得：错误、失败、4xx、5xx）——只写成功的文档让读者猜失败长什么样')

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, checked: { endpoints: eps.length, fences: Math.floor(fences / 2), lines: lines.length, genre: 'http' }, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/api-doc-check/api'
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
      return send(200, lintApiDoc(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
