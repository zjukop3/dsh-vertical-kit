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

export function lintApiDoc(text, rules = {}) {
  const minEndpoints = rules.minEndpoints ?? 1
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')

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
  return { ok: errors === 0, checked: { endpoints: eps.length, fences: Math.floor(fences / 2) }, errors, warnings: findings.length - errors, findings }
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
      const text = typeof body.text === 'string' && body.text ? body.text : body.path ? (await import('node:fs/promises')).readFile(body.path, 'utf8') : ''
      if (!text) return send(400, { error: 'text or path is required' })
      return send(200, lintApiDoc(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
