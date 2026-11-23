// A Dockerfile is decidable from its text: whether the base image is pinned,
// whether the container ends up running as root, whether a secret was baked
// into a layer, and whether each apt/apk install cleans up after itself. This
// verifies exactly those and names the line.

export const name = 'dockerfile-check'
export const inject = ['webServer']

// Instructions are case-insensitive; continuations end with a backslash.
function instructions(text) {
  const lines = String(text).split('\n')
  const out = []
  let buffer = null
  lines.forEach((raw, index) => {
    const line = raw.replace(/\r$/, '')
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) {
      if (buffer) out.push(buffer)
      buffer = null
      return
    }
    const startLine = buffer ? buffer.startLine : index + 1
    const joined = buffer ? `${buffer.text} ${trimmed}` : trimmed
    if (trimmed.endsWith('\\')) {
      buffer = { startLine, text: joined.replace(/\\$/, '').trim() }
      return
    }
    buffer = null
    const match = joined.match(/^([A-Za-z]+)\s+([\s\S]*)$/)
    if (match) out.push({ line: startLine, instruction: match[1].toUpperCase(), args: match[2].trim() })
  })
  if (buffer) out.push(buffer)
  return out
}

export function parseDockerfile(text) {
  return instructions(text)
}

export function lintDockerfile(text, rules = {}) {
  const requireUser = rules.requireUser ?? true
  const allowLatest = rules.allowLatest ?? false
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const ops = instructions(text)

  if (ops.length === 0) {
    return { ok: false, checked: { instructions: 0 }, errors: 1, warnings: 0, findings: [{ level: 'error', rule: 'empty', line: 0, message: '没有可识别的 Dockerfile 指令' }] }
  }

  const froms = ops.filter(op => op.instruction === 'FROM')
  if (froms.length === 0) add('error', 'from-missing', 0, '没有 FROM 指令——这不是一个 Dockerfile')

  // Base image pinning: `:latest` and a bare image name both float. A digest
  // or an explicit tag is reproducible; a floating tag is not.
  if (!allowLatest) {
    for (const op of froms) {
      const image = op.args.split(/\s+/)[0]
      if (!image || image === 'scratch') continue
      if (image.includes('@sha256:')) continue
      if (!image.includes(':') || /:latest$/i.test(image)) {
        add('error', 'base-unpinned', op.line, `第 ${op.line} 行基础镜像「${image}」没有固定标签或 digest——「${image}:latest」这类浮动标签让构建不可复现`)
      }
    }
  }

  // Root: a container that never drops privileges runs as root by default.
  const hasUser = ops.some(op => op.instruction === 'USER')
  if (requireUser && !hasUser) {
    add('error', 'user-missing', 0, '没有任何 USER 指令——容器默认以 root 运行，镜像被拿下就是宿主 root')
  } else if (hasUser) {
    const user = ops.filter(op => op.instruction === 'USER').at(-1)
    if (/^(root|0)(:0)?$/.test(user.args.trim())) {
      add('error', 'user-root', user.line, `第 ${user.line} 行显式指定了 root——USER 写了 root 等于没写`)
    }
  }

  // Secrets baked into a layer: ENV/ARG with a secret-looking name carrying a
  // literal value. The value stays in the layer history forever.
  for (const op of ops) {
    if (op.instruction !== 'ENV' && op.instruction !== 'ARG') continue
    const assignment = op.args.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\S+)/)
    const key = assignment ? assignment[1] : (op.args.split(/\s+/)[0] || '')
    const value = assignment ? assignment[2] : ''
    if (/(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)/i.test(key) && value && !/^\$\{?/.test(value) && value !== '""') {
      add('error', 'secret-in-layer', op.line, `第 ${op.line} 行把疑似密钥「${key}」写成了字面值——层历史永久保留，改用构建期 secret 或运行时注入`)
    }
  }

  // ADD vs COPY: ADD also unpacks archives and fetches URLs, which surprises
  // readers. For a plain local copy, COPY says exactly what happens.
  for (const op of ops) {
    if (op.instruction !== 'ADD') continue
    const [source] = op.args.split(/\s+/)
    if (source && !/^https?:\/\//i.test(source) && !/\.(?:tar|tar\.gz|tgz|tar\.bz2|tar\.xz|zip)$/i.test(source)) {
      add('warn', 'add-instead-of-copy', op.line, `第 ${op.line} 行用的是 ADD 但源不是 URL 也不是压缩包——COPY 语义更窄，读者不用猜`)
    }
  }

  // Package manager cleanup: an install without removing the index ships the
  // index in the layer.
  for (const op of ops) {
    if (op.instruction !== 'RUN') continue
    const args = op.args
    if (/\bapt-get\s+install\b/.test(args) && !/rm\s+-rf\s+\/var\/lib\/apt\/lists/.test(args)) {
      add('warn', 'apt-not-cleaned', op.line, `第 ${op.line} 行 apt-get install 后没有清理 /var/lib/apt/lists——索引会留在镜像层里`)
    }
    if (/\bapk\s+add\b/.test(args) && !/--no-cache/.test(args) && !/rm\s+-rf\s+\/var\/cache\/apk/.test(args)) {
      add('warn', 'apk-not-cleaned', op.line, `第 ${op.line} 行 apk add 没有 --no-cache——包索引会留在镜像层里`)
    }
  }

  // WORKDIR: without it every relative path lands in /, and the next COPY
  // silently writes to a surprising place.
  if (!ops.some(op => op.instruction === 'WORKDIR')) {
    add('warn', 'workdir-missing', 0, '没有 WORKDIR——相对路径会落在 /，后续 COPY 的位置容易看错')
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, checked: { instructions: ops.length, froms: froms.length }, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/dockerfile-check/api'
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
      return send(200, lintDockerfile(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
