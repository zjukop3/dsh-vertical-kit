// A test report is decidable from the markdown: the counts must add up
// (passed + failed + skipped = total), the environment must be stated, and
// each failure needs somewhere to start. This verifies exactly those.

export const name = 'test-report-check'
export const inject = ['webServer']

const ENV_HEADING = /(?:^|\n)#{1,6}[^\n]*(?:环境|environment|配置|platform)/i
const ENV_LINE = /^[^\n]*(?:环境[：:]|系统[：:]|版本[：:]\s*\S|node[：:]\s*v?\d)/i

// A counts line: `passed 12`, `通过 8`, `failed 3, skipped 1` — pairs of a
// count word and a number.
export function readCounts(text) {
  const counts = {}
  const patterns = [
    ['passed', /(?:通过|passed|成功)\s*[：:（(]?\s*(\d+)/i],
    ['failed', /(?:失败|failed|未通过)\s*[：:（(]?\s*(\d+)/i],
    ['skipped', /(?:跳过|skipped|忽略)\s*[：:（(]?\s*(\d+)/i],
    ['total', /(?:总计|共|总数|total)\s*[：:（(]?\s*(\d+)/i],
  ]
  for (const [key, pattern] of patterns) {
    const match = text.match(pattern)
    if (match) counts[key] = Number(match[1])
  }
  return counts
}

// 文件名双关第三次：test-report.md / loadtest-report.md 也常被用来写**性能报告**——
// 里面是 p50/p95、QPS、并发轮次，没有通过/失败计数。拿「测试报告」的规则判它，
// 等于问一份压测报告「你过了几条用例」。识别出来，指向专门的那个检查。
export const PERF_MARK = /(?:p\d{2,3}\b|百分位|分位|percentile|qps\b|rps\b|吞吐|throughput|并发|concurrency|latency|延迟)/i
export const COUNT_MARK = /(?:通过\s*\d|失败\s*\d|passed[:：]?\s*\d|failed[:：]?\s*\d|\d+\s*(?:个)?(?:用例|tests?)\s*(?:通过|失败))/i

export function isPerfReport(text) {
  return PERF_MARK.test(String(text)) && !COUNT_MARK.test(String(text))
}

export function lintTestReport(text, rules = {}) {
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')

  // 性能报告：先判文体，指向专门的那个检查，别拿用例计数去判它。
  if (isPerfReport(text)) {
    findings.push({
      level: 'warn',
      rule: 'performance-report',
      line: 0,
      message: '这份文档是性能报告（延迟分位 / 吞吐 / 并发），不是测试报告：用例计数、勾稽、失败详情这些规则在这里不适用。用 dsh-perf-report-check 判它',
    })
    return { ok: true, checked: { performanceReport: true, counts: null }, errors: 0, warnings: 1, findings }
  }

  const counts = readCounts(text)

  // Arithmetic: passed + failed + skipped must equal total, when both sides
  // of the equation are stated. 18 of the 1,302 audited catalog entries in
  // the ecosystem shipped numbers that did not add up; this is the cheapest
  // possible place to catch it.
  if (counts.total !== undefined) {
    const parts = ['passed', 'failed', 'skipped'].filter(key => counts[key] !== undefined)
    if (parts.length >= 2) {
      const sum = parts.reduce((sum, key) => sum + counts[key], 0)
      if (sum !== counts.total) {
        const detail = parts.map(key => `${key} ${counts[key]}`).join(' + ')
        const number = lines.findIndex(line => /(?:总计|共|总数|total)/i.test(line)) + 1
        add('error', 'sum-mismatch', number, `第 ${number} 行用例数勾稽不平：${detail} = ${sum}，total 却是 ${counts.total}`)
      }
    } else {
      add('warn', 'counts-partial', 0, '只报了 total 没有分项（或反之）——分项与总数同时在场，勾稽才有意义')
    }
  } else if (Object.keys(counts).length > 0) {
    add('warn', 'total-missing', 0, '有分项没有总数（认得：总计 12、共 8、total 3）——读者无法核对分项加起来对不对')
  } else {
    add('error', 'counts-missing', 0, '全文没有任何用例计数（认得：通过 12、失败 3、跳过 1、总计 15）——测试报告没有计数就不是报告')
  }

  // Environment: a test on an unstated machine is a test nobody can rerun.
  const hasEnv = lines.some(line => ENV_HEADING.test(`\n${line}`)) || lines.some(line => ENV_LINE.test(line))
  if (!hasEnv) add('error', 'env-missing', 0, '没有测试环境（认得：## 测试环境、环境：…、OS：…、Node：v…）——不写环境的结果无法复跑')

  // Failures need a pointer: a failing count with no failure section leaves
  // the reader with a number and nowhere to go.
  if (counts.failed !== undefined && counts.failed > 0) {
    const hasFailureDetail = lines.some(line => /(?:失败详情|失败用例|failure details?|failing)/i.test(line)) || lines.some(line => /(?:失败|failed)[^\n]*[：:]/i.test(line) && ENV_LINE.test(line) === false && /\d/.test(line) === false)
    if (!hasFailureDetail) add('error', 'failure-detail-missing', 0, `报告了 ${counts.failed} 个失败但没有失败详情段（认得：## 失败详情、失败用例：）——数字要有地方往下看`)
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, checked: { counts, lines: lines.length }, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/test-report-check/api'
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
      return send(200, lintTestReport(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
