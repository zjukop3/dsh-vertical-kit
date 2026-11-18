// A .env.example is decidable from its text: every key carries a placeholder
// rather than a real value, the file says what each key is for, and no
// committed key looks like a live credential. This verifies exactly those —
// the file is the contract every new contributor reads first.

export const name = 'env-example-check'
export const inject = ['webServer']

// `KEY=value`, `KEY=""`, `export KEY=value`; `#` starts a comment.
export function parseEnv(text) {
  const entries = []
  String(text).split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '')
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) return
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) {
      entries.push({ line: index + 1, key: null, value: trimmed, raw: line })
      return
    }
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    entries.push({ line: index + 1, key: match[1], value, raw: line, commented: false })
  })
  return entries
}

// A placeholder is a value a reader must replace: empty, angle-bracketed,
// your-/change-me style, or a `${VAR}` reference. Anything else is a literal
// that shipped.
const PLACEHOLDER = /^(?:|.*<[^>]+>.*|.*\{[^}]+\}.*|your[-_ ].*|change[-_ ]?me.*|xxx+|\*+|todo.*|placeholder.*|example.*|dummy.*|test.*|none|null)$/i

export function lintEnvExample(text, rules = {}) {
  const requireComment = rules.requireComment ?? false
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = String(text).split('\n')
  const entries = parseEnv(text)

  if (entries.length === 0) {
    return { ok: false, checked: { keys: 0 }, errors: 1, warnings: 0, findings: [{ level: 'error', rule: 'empty', line: 0, message: '没有任何 KEY=value 行——.env.example 至少要给出一组键' }] }
  }

  const keys = entries.filter(entry => entry.key)
  if (keys.length === 0) add('error', 'no-keys', 0, '没有可解析的 KEY=value 行——示例文件的价值就是那组键')

  // A key with a real-looking value is the whole reason this file gets
  // committed by accident: `.env.example` is copied from `.env`.
  for (const entry of entries) {
    if (!entry.key) {
      add('warn', 'line-unparsed', entry.line, `第 ${entry.line} 行不是 KEY=value 形式：「${entry.raw.trim().slice(0, 30)}」`)
      continue
    }
    if (!PLACEHOLDER.test(entry.value)) {
      add('error', 'literal-value', entry.line, `第 ${entry.line} 行 ${entry.key} 带了字面值「${entry.value.slice(0, 20)}」——示例文件只放占位符，真值进 .env（不提交）`)
    }
  }

  // Duplicate keys: the later assignment wins silently.
  const seen = new Map()
  for (const entry of keys) {
    if (seen.has(entry.key)) add('error', 'duplicate-key', entry.line, `第 ${entry.line} 行 ${entry.key} 与第 ${seen.get(entry.key)} 行重复——后一个会静默覆盖前一个`)
    else seen.set(entry.key, entry.line)
  }

  // Key shape: lowercase env keys work but are unusual, and a key with a dash
  // is not a valid shell variable at all.
  for (const entry of keys) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(entry.key)) {
      add('warn', 'key-case', entry.line, `第 ${entry.line} 行键名「${entry.key}」不是全大写加下划线——shell 里大小写不同是两个变量`)
    }
  }

  // Comments: an example file without any comment does not say what to put in
  // each key, which is the only reason a reader opens it.
  const hasComment = lines.some(line => line.trim().startsWith('#'))
  if (requireComment && !hasComment) add('error', 'no-comment', 0, '没有任何注释行——示例文件要说明每个键是干什么的')
  else if (!hasComment) add('warn', 'comment-missing', 0, '没有任何注释行——说明每个键的用途，读者才知道该填什么')

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, checked: { keys: keys.length, lines: lines.length }, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/env-example-check/api'
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
      return send(200, lintEnvExample(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
