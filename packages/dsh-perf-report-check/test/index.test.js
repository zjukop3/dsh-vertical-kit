import test from 'node:test'
import assert from 'node:assert/strict'
import { lintPerfReport, hasTitle } from '../src/index.js'

const good = `# 首页接口压测报告

## 测试环境

机器：8 核 16G，Node v22.19，数据规模 20k 条

## 负载

20 并发 × 6 轮 = 120 请求

## 结果

| 配置 | p50 | p95 | p99 |
|---|---|---|---|
| 基线（优化前） | 4.898s | 5.038s | 5.105s |
| 优化后 | 0.338s | 0.587s | 0.615s |

## 结论

p50 提升约 14.5×。

## 复现

\`k6 run scripts/load/home.js\`
`

const bad = `# 压测

首页接口很慢，平均 4.9 秒。
`

test('一份完整的压测报告零发现', () => {
  const result = lintPerfReport(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.ok, true)
})

test('只给一个平均值的报告报 latency-missing 与四条 warn/error', () => {
  const result = lintPerfReport(bad)
  const rules = result.findings.map(f => f.rule)
  assert.ok(rules.includes('latency-missing'), rules.join(','))
  assert.ok(rules.includes('load-missing'), rules.join(','))
  assert.ok(rules.includes('env-missing'), rules.join(','))
  assert.ok(rules.includes('baseline-missing'), rules.join(','))
})

// 真实语料（6 份公开性能报告）的三处修正，都属「只认一种写法」：
test('标题不必在第一行：语言切换行之后也算', () => {
  const text = '[English](a.md) | [简体中文](b.md)\n\n# Parallel Search Performance Report\n\n20 并发，p95 1503ms。环境：Linux 8 线程。\n'
  assert.equal(hasTitle(text), true)
  assert.ok(!lintPerfReport(text).findings.some(f => f.rule === 'title-missing'))
})

test('结论段叫 Findings / Go-no-go recommendation / 结果分析 都算', () => {
  for (const heading of ['## Findings', '## Go / no-go recommendation', '## 结果分析', '## Recommendation']) {
    const text = good.replace('## 结论', heading)
    const result = lintPerfReport(text)
    assert.ok(!result.findings.some(f => f.rule === 'conclusion-missing'), heading)
  }
})

test('「median of 3 reps」「7-run medians」「best 0.65ms」都算可比度量', () => {
  const base = '# 基准\n\n## 测试环境\n\nPCWIN64，8 compute threads\n\n20k 条数据\n'
  for (const metric of ['Iter time is the median of 3 reps.', 'medians of 7 warm runs.', 'one-shot best: 0.65ms.']) {
    const text = `${base}\n## 结果\n\n${metric}\n\n基线 191.2ms → 现在 2.2ms。\n\n## Findings\n\n看上面。\n\n用 tests/perf/run_perf.ps1 复现。\n`
    const result = lintPerfReport(text)
    assert.ok(!result.findings.some(f => f.rule === 'latency-missing'), metric)
  }
})

test('平台名与线程数算环境信息', () => {
  const text = '# 报告\n\nPoint-in-time measurement on `PCWIN64`, 8 compute threads.\n\n20 并发，p95 587ms。对照基线 4.9s → 0.6s。\n\n## Findings\n\n好。\n\nharness 脚本 scripts/run.mjs。\n'
  assert.ok(!lintPerfReport(text).findings.some(f => f.rule === 'env-missing'))
})

test('完全不写环境仍然报 env-missing', () => {
  const text = '# 报告\n\n20 并发，p95 587ms。\n'
  assert.ok(lintPerfReport(text).findings.some(f => f.rule === 'env-missing'))
})

test('strict 把三条 warn 升级为 error', () => {
  const text = '# 报告\n\n## 测试环境\n\nLinux 8 线程\n\n20 并发，p95 587ms。\n'
  const relaxed = lintPerfReport(text)
  assert.ok(relaxed.ok, '默认这些只是 warn')
  const strict = lintPerfReport(text, { strict: true })
  assert.equal(strict.ok, false)
  for (const rule of ['baseline-missing', 'conclusion-missing', 'repro-missing']) {
    assert.ok(strict.findings.some(f => f.rule === rule && f.level === 'error'), rule)
  }
})