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
