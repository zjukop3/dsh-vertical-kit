import test from 'node:test'
import assert from 'node:assert/strict'
import { lintEnvExample, parseEnv } from '../src/index.js'

const good = `# 数据库
DATABASE_URL=<your-database-url>
# 端口
PORT=<8080>
# 密钥，勿提交真值
API_KEY=\${API_KEY}
`

const bad = `DATABASE_URL=postgres://user:pass@prod-db:5432/app
PORT=8080
API_KEY=sk-live-abc123
`

test('a clean example file passes', () => {
  const result = lintEnvExample(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.keys, 3)
})

test('literal values are errors on their own lines', () => {
  const result = lintEnvExample(bad)
  assert.equal(result.ok, false)
  const literals = result.findings.filter(finding => finding.rule === 'literal-value')
  assert.equal(literals.length, 3)
  assert.deepEqual(literals.map(finding => finding.line), [1, 2, 3])
})

test('parseEnv handles export, quotes and comments', () => {
  const entries = parseEnv('export A=1\nB="two words"\n# comment\nC=\'three\'\n')
  assert.deepEqual(entries.map(entry => [entry.key, entry.value]), [['A', '1'], ['B', 'two words'], ['C', 'three']])
})

test('placeholders in several shapes are accepted', () => {
  const text = 'A=\nB=<token>\nC=${VAR}\nD=your-key\nE=changeme\nF=xxx\nG=TODO\n'
  const literals = lintEnvExample(text).findings.filter(finding => finding.rule === 'literal-value')
  assert.deepEqual(literals, [])
})

test('a duplicate key is an error naming both lines', () => {
  const text = '# c\nPORT=<8080>\nPORT=<9090>\n'
  const result = lintEnvExample(text)
  const duplicate = result.findings.find(finding => finding.rule === 'duplicate-key')
  assert.ok(duplicate)
  assert.match(duplicate.message, /第 3 行/)
  assert.match(duplicate.message, /第 2 行/)
})

test('a lowercase key is a warn', () => {
  const text = '# c\nport=<8080>\n'
  assert.ok(lintEnvExample(text).findings.some(finding => finding.rule === 'key-case'))
})

test('an unparseable line is a warn naming the line', () => {
  const text = '# c\nPORT=<8080>\nthis is not an assignment\n'
  assert.ok(lintEnvExample(text).findings.some(finding => finding.rule === 'line-unparsed' && finding.line === 3))
})

test('comments are a warn by default and an error when required', () => {
  const text = 'PORT=<8080>\n'
  assert.ok(lintEnvExample(text).findings.some(finding => finding.rule === 'comment-missing' && finding.level === 'warn'))
  assert.ok(lintEnvExample(text, { requireComment: true }).findings.some(finding => finding.rule === 'no-comment' && finding.level === 'error'))
})

test('an empty file is one empty error', () => {
  const result = lintEnvExample('\n# only a comment\n')
  assert.equal(result.ok, false)
  assert.equal(result.findings[0].rule, 'empty')
})

test('a file with no parsable key is an error', () => {
  // `no-keys` needs at least one non-comment line that failed to parse: with
  // nothing at all the `empty` rule takes over. An all-comment file is the
  // empty case; a file of assignments that never parse is this one.
  const text = '=no-key-before-equals\n:also-bad=\n'
  const finding = lintEnvExample(text).findings.find(f => f.rule === 'no-keys')
  assert.ok(finding, JSON.stringify(lintEnvExample(text).findings.map(f => f.rule)))
  assert.equal(finding.level, 'error')
})

test('an all-comment file is the empty case, not no-keys', () => {
  const result = lintEnvExample('# 只有注释\n# 一条键都没有\n')
  assert.ok(result.findings.some(f => f.rule === 'empty'))
  assert.ok(!result.findings.some(f => f.rule === 'no-keys'))
})

test('a documentation URL on a reserved example domain is a placeholder', () => {
  // Found in a real third-party .env.example: the only crime was documenting
  // `https://remote.example.edu/...`, which is a placeholder by RFC 2606 intent.
  const doc = `# 公共地址，桌面端用同一个
RELAY_URL=https://remote.example.edu/eduwork-remote/
# 随机密钥
RELAY_ACCESS_KEYS=
`
  const result = lintEnvExample(doc)
  assert.deepEqual(result.findings, [])
})

test('reserved hosts and loopback count, a real host does not', () => {
  const reserved = ['http://localhost:8080/x', 'https://127.0.0.1/x', 'https://example.com', 'https://api.example.org/v1', 'https://svc.internal.test/']
  for (const value of reserved) {
    const result = lintEnvExample(`# 说明\nURL=${value}\n`)
    assert.ok(!result.findings.some(f => f.rule === 'literal-value'), value)
  }
  const real = ['https://relay.mycompany.cn/x', 'https://10.1.2.3/x', 'sk-live-abc123456789']
  for (const value of real) {
    const result = lintEnvExample(`# 说明\nURL=${value}\n`)
    assert.ok(result.findings.some(f => f.rule === 'literal-value'), value)
  }
})
