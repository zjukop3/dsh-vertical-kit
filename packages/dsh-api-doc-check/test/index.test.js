import test from 'node:test'
import assert from 'node:assert/strict'
import { lintApiDoc, endpoints } from '../src/index.js'

const good = `# 商品接口

## 鉴权

所有请求需要在 header 带 \`Authorization: Bearer <token>\`。

## 列出商品

\`\`\`
GET /v1/items
\`\`\`

响应：

\`\`\`json
{"items": [], "total": 0}
\`\`\`

## 错误

失败时返回 4xx 与 \`{"error": "..."}\`。
`

const bad = `# 接口说明

我们的接口在 /v1/items 上，可以用。
`

test('a complete api doc passes', () => {
  const result = lintApiDoc(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.endpoints, 1)
})

test('every defect class is reported', () => {
  const result = lintApiDoc(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => finding.rule)
  assert.ok(rules.includes('endpoints-missing'))
  assert.ok(rules.includes('examples-missing'))
  assert.ok(rules.includes('auth-missing'))
  assert.ok(rules.includes('error-shape-missing'))
})

test('a bare path without a method is not an endpoint', () => {
  assert.deepEqual(endpoints('接口在 /v1/items 上'), [])
  assert.deepEqual(endpoints('GET /v1/items'), [{ line: 1, method: 'GET', path: '/v1/items', text: 'GET /v1/items' }])
})

test('every method is recognized', () => {
  const text = 'GET /a\nPOST /b\nPUT /c\nPATCH /d\nDELETE /e\n'
  assert.deepEqual(endpoints(text).map(e => e.method), ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
})

test('endpoint floor is configurable', () => {
  const text = '# a\n\n鉴权：Bearer\n\n```\nGET /v1/x\n```\n\n错误：4xx\n'
  assert.deepEqual(lintApiDoc(text).findings, [])
  const strict = lintApiDoc(text, { minEndpoints: 3 })
  assert.ok(strict.findings.some(finding => finding.rule === 'endpoints-missing'))
})

test('error shape is a warn, not an error', () => {
  const text = '# a\n\n鉴权：Bearer\n\n```\nGET /v1/x\n```\n'
  const result = lintApiDoc(text)
  assert.equal(result.ok, true)
  assert.ok(result.findings.some(finding => finding.rule === 'error-shape-missing' && finding.level === 'warn'))
})

// 真实语料（all-smi / ethercalc / LogShare 三份真实 API 文档）：本机与 Unix socket 的
// API 没有鉴权面，问它「怎么证明身份」等于问本机进程怎么证明自己是本机。
test('明说「无需鉴权」或只在本机/Unix socket 上监听时，不报 auth-missing', () => {
  const base = '## 接口\n\nGET /v1/items\n\n```\ncurl http://api.example.com/v1/items\n```\n\n```\n{"ok":true}\n```\n\n错误：404 表示不存在。\n'
  assert.ok(lintApiDoc(base).findings.some(f => f.rule === 'auth-missing'), '远端 API 没写鉴权应报')
  assert.ok(!lintApiDoc(`${base}\n本服务无需鉴权。\n`).findings.some(f => f.rule === 'auth-missing'))
  assert.ok(!lintApiDoc(`${base}\ncurl http://localhost:9090/metrics\n`).findings.some(f => f.rule === 'auth-missing'))
})

test('分页里的 token 不算鉴权说明', () => {
  const text = '## 接口\n\nGET /v1/items\n\n```\ncurl https://api.example.com/v1/items\n```\n\n```\n{"next_page_token":"abc"}\n```\n\n错误：4xx。\n'
  assert.ok(lintApiDoc(text).findings.some(f => f.rule === 'auth-missing'), '只有分页 token 不该算鉴权')
  assert.ok(!lintApiDoc(text.replace('错误：4xx。', '使用 Authorization: Bearer <token>。错误：4xx。')).findings.some(f => f.rule === 'auth-missing'))
})

// 2026-11-24：拿 DSH 自带的接口类文档 8 份（6 份 cordis-api + api-gateway + tool-catalog）校准。
// 「接口文档」被我当成一种：全部要求「METHOD + 路径 + 鉴权」，而其中六份是**库参考**
// （一个类、它的成员、每个成员的签名块），一份是**架构参考**，一份是**目录表**。
const LIBRARY = `# Service

The base class for context services. A subclass registers itself as \`ctx.<name>\`.

[Source](../../vendor/cordis/src/service.ts#L11)

### service.name

\`\`\`ts cordis-catalog
public name!: string
\`\`\`

The service name this instance is registered under.
`

test('库参考：不要求 METHOD 路径与鉴权，只问定义、形状、实现出处', () => {
  const result = lintApiDoc(LIBRARY)
  assert.equal(result.checked.genre, 'library')
  assert.deepEqual(result.findings.map(finding => finding.rule), [])
})

test('库参考缺定义/缺形状/缺出处时分别报得出', () => {
  const noSummary = lintApiDoc(LIBRARY.replace(/^The base class[^\n]*$/m, ''))
  assert.ok(noSummary.findings.some(finding => finding.rule === 'summary-missing'))
  // 没有签名也没有标识符、但**有成员小节**的参考页：这才是不该被放过的那种。
  const noShape = lintApiDoc('# X\n\n一句定义，写了四十个字符以上的说明文字用来占位，但是没有形状也没有标识符。\n\n### a\n\n### b\n')
  assert.ok(noShape.findings.some(finding => finding.rule === 'signature-missing'))
  const noSource = lintApiDoc(LIBRARY.replace(/^\[Source\].*$/m, ''))
  assert.ok(noSource.findings.some(finding => finding.rule === 'source-missing'))
})

test('目录表只给一句 reference-catalog', () => {
  const table = ['# Catalog', '', '| Name | Description |', '| --- | --- |', ...Array.from({ length: 9 }, (_, i) => `| tool-${i} | does ${i} |`)].join('\n')
  const result = lintApiDoc(table)
  assert.equal(result.checked.genre, 'catalog')
  assert.deepEqual(result.findings.map(finding => finding.rule), ['reference-catalog'])
  assert.equal(result.ok, true)
})

test('HTTP 接口文档仍是 http 体裁：端点、鉴权、错误形状照旧判', () => {
  const http = '# API\n\n## 鉴权\n\nBearer token。\n\n```\nGET /v1/items\n```\n\n错误返回 4xx。\n'
  const result = lintApiDoc(http)
  assert.equal(result.checked.genre, 'http')
  const rules = result.findings.map(finding => finding.rule)
  assert.ok(!rules.includes('reference-catalog'))
})
