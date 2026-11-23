// A performance report — load test or micro-benchmark, the same file name is
// used for both — answers three questions and is worthless without them:
// **under what conditions** (concurrency, rate, iterations, dataset size),
// **what came out** (a distribution or at least a repeat count, not one number
// from one run), and **compared to what** (a baseline). Two more make it
// repeatable: the environment, and the command that produced the numbers.
//
// Measured on six public reports (2026-11-23): one load test with percentiles,
// five benchmark comparisons with medians over N runs. All six are legitimate
// documents, which is why the metric rule accepts percentiles, throughput and
// repeated-sample medians alike.

export const name = 'perf-report-check'
export const inject = ['webServer']

// 标题不必在第一行：真实报告常把语言切换、状态行放在最前面
// （gotry：`[English] | [简体中文]` 之后才是 `# Parallel Search Performance Report`）。
export function hasTitle(text) {
  const lines = String(text).split('\n').filter(line => line.trim() !== '')
  return lines.slice(0, 5).some(line => /^#\s+\S/.test(line))
}

const heading = words => new RegExp(`(?:^|\\n)#{1,6}[^\\n]*(?:${words})`, 'i')
const label = words => new RegExp(`^[^\\n]*(?:${words})\\s*[：:]`, 'i')

// The load itself: concurrency × rounds, a request rate, or a user count — with
// a number attached. "under heavy load" is not a load.
export const LOAD =
  /(?:\d+\s*(?:并发|concurrent|threads?|vus?|users?|连接|compute threads?)|(?:并发|concurrency)[^\n]{0,12}\d+|\d+\s*(?:qps|rps|req\/s|requests? per second)|(?:qps|rps)\s*[=:：]?\s*\d+|(?:\d+\s*轮|\d+\s*(?:rounds?|iterations?|reps?|runs?|samples?))|\d+\s*-?\s*run\b|(?:1k|5k|20k|\d+\s*(?:files|rows|records|条|行)))/i

// Latency as a distribution: at least one percentile, or p50/p95/p99 pair.
// 一个数字不算分布：要有分位、有吞吐、或者明确说了「N 次取中位数」。
export const LATENCY =
  /(?:p\d{2,3}|百分位|分位|percentile)[^\n]{0,24}\d|\b\d+(?:\.\d+)?\s*(?:ms|毫秒|s)\b[^\n]{0,24}(?:p\d{2,3}|分位)|(?:median|中位数|均值|平均|mean)[^\n]{0,24}\d+(?:\.\d+)?\s*(?:ms|毫秒|s\b)|median[s]?[^\n]{0,16}(?:of\s*)?\d+\s*(?:[a-z]+\s+)?(?:runs?|reps?|samples?)|(?:best|worst|fastest|slowest)[^\n]{0,16}\d+(?:\.\d+)?\s*(?:ms|毫秒|s\b)|\d+(?:\.\d+)?\s*(?:ops|req|files|it|iterations?|rows)\/s|\d+\s*(?:-run|runs?|reps?)\s*(?:median|medians|med\b)/i

const ENV = heading('环境|测试环境|配置|机器|硬件|environment|setup|configuration')
// 真实报告写平台名与线程数：「Point-in-time measurement on PCWIN64, 8 compute threads」。
// 只认「环境：/CPU/内存」会把它判成没写环境（2026-11-23 实测）。
const ENV_LINE =
  /(?:环境[：:]|机器[：:]|硬件|hardware|machine|CPU|内存\s*\d+|实例|机型|OS[：:]|Node\s+v?\d|版本[：:]\s*v?\d|数据规模|数据集|\b(?:PC)?WIN64\b|\bLinux\b|\bmacOS\b|\bWindows\b|\bplatform\b|compute threads?|\bthreads\b|\bCI\b)/i
// 对照也可以是「191.2 ms → 2.2 ms（87×）」或一个 ×N 倍数，不需要出现 baseline 这个词。
const BASELINE =
  /(?:基线|优化前|改造前|对照|baseline|原(?:始)?(?:基线|版本)|\bbefore\b[^\n]{0,20}\bafter\b|candidate|\d+(?:\.\d+)?\s*(?:ms|s|files\/s)\s*(?:→|->|=>)|\d+(?:\.\d+)?\s*×|\d+(?:\.\d+)?x\s*(?:faster|speedup|times))/i
// 结论段在真实报告里叫 Findings、Analysis、Go / no-go recommendation、
// 结果分析——它们都承载判断，不叫 Conclusion。
const CONCLUSION = heading('结论|总结|建议|分析|结果|conclusion|summary|takeaway|findings|analysis|notes|recommendation|verdict')
// 复现也可以是「用 tests/perf/run_perf.ps1 重新生成」或一个 harness 脚本路径。
const REPRO =
  /(?:复现|重现|命令|脚本|locust|k6|wrk|ab\s+-n|jmeter|vegeta|hey\s+-n|reproduce|regenerate|re-?run|harness|\.ps1\b|\.sh\b|\.mjs\b|\bmake [a-z]|\bcargo [a-z]|\bnpm run)/i

export function lintPerfReport(text, rules = {}) {
  const strict = rules.strict ?? false
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = String(text).split('\n')
  const any = pattern => lines.some(line => pattern.test(`\n${line}`) || pattern.test(line))

  if (!hasTitle(text)) add('error', 'title-missing', 1, '第一行没有 `# 标题`——压测报告要说明它压的是什么')

  if (!LOAD.test(text)) {
    add('error', 'load-missing', 0, '没有写清在什么条件下测的（认得：20 并发、100 QPS、6 轮、7-run、20k 条）——没有条件的数字无法比较')
  }

  if (!LATENCY.test(text)) {
    add('error', 'latency-missing', 0, '没有可比较的度量（认得：p50 340ms、p95、中位数 191ms、33 906 files/s、7-run medians）——单次跑出来的一个数字说明不了分布')
  }

  if (!any(ENV) && !any(ENV_LINE)) {
    add('error', 'env-missing', 0, '没有环境信息（认得：## 测试环境、机器：…、CPU、内存、数据规模）——同一个接口在不同机器上差 10 倍，不写环境的结果无法复跑')
  }

  if (!BASELINE.test(text)) {
    add(strict ? 'error' : 'warn', 'baseline-missing', 0, '没有基线对照（认得：基线、优化前、对照、baseline）——没有对照的数字，读者不知道这是好还是坏')
  }

  if (!any(CONCLUSION)) {
    add(strict ? 'error' : 'warn', 'conclusion-missing', 0, '没有结论段（认得：## 结论、## 总结、## Takeaway）——表格留给读者自己算，等于没给建议')
  }

  if (!REPRO.test(text)) {
    add(strict ? 'error' : 'warn', 'repro-missing', 0, '没有复现方式（认得：## 复现、locust、k6、wrk 命令）——别人无法验证这组数字')
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked: { lines: lines.length, percentiles: (text.match(/\bp\d{2,3}\b/gi) ?? []).length },
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/perf-report-check/api'
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
      return send(200, lintLoadtestReport(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}