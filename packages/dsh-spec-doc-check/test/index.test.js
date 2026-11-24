import test from 'node:test'
import assert from 'node:assert/strict'
import { lintSpecDoc, criteriaItems, vagueCriteria } from '../src/index.js'

const good = `# 导出功能重做

## 背景

现有导出在 1 万行以上会超时，客服每周收到约 5 次相关投诉。

## 验收标准

- 导出 10 万行在 30 秒内完成
- 失败时接口返回 5xx 并在响应体给出 错误码
- 断网重试 3 次后仍失败，界面出现明确提示

## 不做

- 不改导出列的顺序
- 不支持增量导出
`

const bad = `# 导出重做

我觉得现在的导出体验不够好，想重做一下。

## 验收标准

- 体验良好
- 速度合理
`

test('a complete spec passes', () => {
  const result = lintSpecDoc(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.criteria, 3)
})

test('vague criteria are errors naming the word and the line', () => {
  const result = lintSpecDoc(bad)
  assert.equal(result.ok, false)
  const vague = result.findings.filter(finding => finding.rule === 'criteria-vague')
  assert.equal(vague.length, 2)
  assert.ok(vague.some(finding => finding.message.includes('良好')))
  assert.ok(vague.some(finding => finding.message.includes('合理')))
})

test('a vague word is accepted when the same item carries a threshold', () => {
  const text = '## 背景\n\n问题：慢。\n\n## 验收标准\n\n- 界面响应更快速，p95 从 800ms 降到 200ms\n- 体验合理，错误率不超过 0.5%\n\n## 不做\n\n- 不改配色\n'
  assert.deepEqual(lintSpecDoc(text).findings, [])
})

test('problem, criteria and out-of-scope are each reported when missing', () => {
  const result = lintSpecDoc('随便写点东西。\n')
  const rules = result.findings.map(finding => finding.rule)
  assert.ok(rules.includes('problem-missing'))
  assert.ok(rules.includes('criteria-missing'))
  assert.ok(rules.includes('out-of-scope-missing'))
})

test('criteriaItems reads bullets and numbered items under the heading', () => {
  const text = '# s\n\n## 验收标准\n\n- 甲\n1. 乙\n\n## 其它\n\n- 不是标准\n'
  const items = criteriaItems(text)
  assert.deepEqual(items.map(item => item.text), ['甲', '乙'])
})

test('vagueCriteria stops at items carrying a number', () => {
  const items = [
    { line: 1, text: '体验良好' },
    { line: 2, text: '体验良好，p95 < 200ms' },
    { line: 3, text: '导出 10 万行在 30 秒内完成' },
  ]
  assert.deepEqual(vagueCriteria(items).map(item => item.line), [1])
})

test('criteria-thin warns below the floor, configurable', () => {
  const text = '## 背景\n\n问题：慢。\n\n## 验收标准\n\n- p95 低于 200ms\n\n## 不做\n\n- 不改配色\n'
  assert.ok(lintSpecDoc(text).findings.some(finding => finding.rule === 'criteria-thin'))
  assert.ok(!lintSpecDoc(text, { minCriteria: 1 }).findings.some(finding => finding.rule === 'criteria-thin'))
})

test('the out-of-scope requirement is configurable away', () => {
  const text = '## 背景\n\n问题：慢。\n\n## 验收标准\n\n- p95 低于 200ms\n- 错误率低于 0.1%\n'
  assert.ok(lintSpecDoc(text).findings.some(finding => finding.rule === 'out-of-scope-missing'))
  assert.ok(!lintSpecDoc(text, { requireOutOfScope: false }).findings.some(finding => finding.rule === 'out-of-scope-missing'))
})

test('an empty open-questions section is a warn', () => {
  const text = '## 背景\n\n问题：慢。\n\n## 验收标准\n\n- p95 低于 200ms\n- 错误率低于 0.1%\n\n## 不做\n\n- 不改配色\n\n## 待定\n\n'
  assert.ok(lintSpecDoc(text).findings.some(finding => finding.rule === 'open-questions-empty'))
  const filled = text + '- 是否需要保留旧接口？\n'
  assert.ok(!lintSpecDoc(filled).findings.some(finding => finding.rule === 'open-questions-empty'))
})

test('an empty document is one empty error', () => {
  const result = lintSpecDoc('  \n')
  assert.equal(result.ok, false)
  assert.equal(result.findings[0].rule, 'empty')
})

// 真实规格语料（Kubernetes KEP）：验收标准常常叫 Test Plan 或 Graduation Criteria。
// 只认「验收标准/acceptance criteria」会在 3/3 的真实 KEP 上误报（2026-11-20）。
test('「### Test Plan」「### Graduation Criteria」都算验收标准', () => {
  for (const heading of ['## Test Plan', '## Graduation Criteria', '## Acceptance criteria']) {
    const text = `# 方案\n\n## Motivation\n\n要解决的问题。\n\n${heading}\n\n1. 单节点 5 分钟内完成\n2. 失败时返回 code 500\n3. 日志包含 trace id\n\n## Non-Goals\n\n- 不做多租户\n`
    const result = lintSpecDoc(text)
    assert.ok(!result.findings.some(f => f.rule === 'criteria-missing'), heading)
    assert.ok(!result.findings.some(f => f.rule === 'criteria-thin'), heading)
  }
})

// 2026-11-24：拿 DSH 自带的 52 份设计文档（47 份 subsystems + 5 份顶层）校准，撞出四种误报。
// 全都是同一个毛病：把「规格」当成一种体裁，而真实生态里有四种。
const REFERENCE = `# User Approval

English | [中文](approval.zh.md)

The user-approval seam answers one question: may this specific action proceed? It owns the request/outcome vocabulary, the \`ctx.approval\` dispatch service, and the \`approval/request\` waterfall.

Source: [\`packages/interaction/user-approval/src/index.ts\`](../../packages/interaction/user-approval/src/index.ts)

## The service

\`ctx.approval\` exposes \`request\` and \`onRequest\`.
`

test('参考文档（reference）：说清是什么、指向实现、写出公开面——不要求验收标准', () => {
  const result = lintSpecDoc(REFERENCE)
  assert.equal(result.checked.genre, 'reference')
  assert.deepEqual(result.findings.filter(finding => ['criteria-missing', 'problem-missing', 'out-of-scope-missing'].includes(finding.rule)), [])
})

test('参考文档缺定义/缺公开面时才报，而且报的是新规则名', () => {
  const noSummary = lintSpecDoc(REFERENCE.replace(/^The user-approval seam[^\n]*$/m, ''))
  assert.ok(noSummary.findings.some(finding => finding.rule === 'summary-missing'))
  const noIdents = lintSpecDoc('# X\n\n一两句说明，但是没有任何标识符，也没有指向实现。\n')
  assert.equal(noIdents.checked.genre, 'proposal', '标识符极少的文档不该被当成参考文档')
})

test('生成的图页（diagram）只要求有标题', () => {
  const diagram = '<!-- Generated by scripts/gen-doc-graphs.ts -->\n\n# Agent Turn And Step Lifecycle\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n'
  const result = lintSpecDoc(diagram)
  assert.equal(result.checked.genre, 'diagram')
  assert.deepEqual(result.findings, [])
  const untitled = lintSpecDoc('```mermaid\ngraph TD\n```\n')
  assert.deepEqual(untitled.findings.map(finding => finding.rule), ['title-missing'])
})

test('索引页（index）只说一句 pointer-guide', () => {
  const links = Array.from({ length: 12 }, (_, index) => `| [page ${index}](page-${index}.md) | owns ${index} |`).join('\n')
  const result = lintSpecDoc(`# Subsystems\n\n| Page | Owns |\n| --- | --- |\n${links}\n`)
  assert.equal(result.checked.genre, 'index')
  assert.deepEqual(result.findings.map(finding => finding.rule), ['pointer-guide'])
})

test('提案体裁不受影响：真规格仍走验收标准那套', () => {
  const spec = `# 方案：交付前自检\n\n## 背景\n\n交付物没人复核。\n\n## 验收标准\n\n- 30 秒内跑完一次检查\n- 失败时打印规则名与行号\n\n## 不做\n\n- 不做自动修复\n`
  const result = lintSpecDoc(spec)
  assert.equal(result.checked.genre, 'proposal')
  assert.deepEqual(result.findings, [])
})

// 每条新规则都要有两个方向：坏文档让它响，好文档让它闭嘴。上面几组只覆盖了「响」。
test('reference 体裁的四条规则：坏的那侧会响，好的那侧不响', () => {
  const cases = [
    ['title-missing', lintSpecDoc('```mermaid\ngraph TD\n```\n')],
    ['pointer-guide', lintSpecDoc(Array.from({ length: 12 }, (_, i) => `| [p${i}](p${i}.md) | x |`).join('\n'))],
    ['source-missing', lintSpecDoc(REFERENCE.replace(/^Source:.*$/m, ''))],
    ['surface-missing', lintSpecDoc(REFERENCE.replace(/`[^`]+`/g, 'X'))],
  ]
  for (const [rule, result] of cases) {
    assert.ok(result.findings.some(finding => finding.rule === rule), `${rule} 该响：${JSON.stringify(result.findings)}`)
  }
  const good = lintSpecDoc(REFERENCE)
  for (const rule of ['title-missing', 'pointer-guide', 'source-missing', 'surface-missing']) {
    assert.ok(!good.findings.some(finding => finding.rule === rule), `${rule} 不该在好文档上响`)
  }
})
