#!/usr/bin/env node
// Exit codes: 0 clean, 1 findings, 2 usage or read error.
import { readFile } from 'node:fs/promises'
import { lintWeeklyReport } from '../src/index.js'

const args = process.argv.slice(2)
const target = args.find(argument => !argument.startsWith('--'))
if (!target) {
  process.stderr.write('usage: weekly-report-check <report.md> [--json] [--min-metrics 1] [--warnings-fail]\n')
  process.exit(2)
}
const option = name => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : Number(args[at + 1])
}
const rules = {}
const minMetrics = option('--min-metrics')
if (minMetrics !== undefined) rules.minMetrics = minMetrics
try {
  const result = await lintWeeklyReport(await readFile(target, 'utf8'), rules)
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const finding of result.findings) process.stdout.write(`${finding.level} ${finding.rule} 第${finding.line}行 ${finding.message}\n`)
    // 社区周报分支的 checked 里没有 done/plan/risks 三个字段；照抄模板就会打出
    // 「ok: undefined done, undefined planned…」。这条已经在 cli-output 闸里被抓到过一次。
    const summary = result.checked.done === undefined
      ? `${result.genre ?? 'report'}`
      : `${result.checked.done} done, ${result.checked.plan} planned, ${result.checked.risks} risks`
    process.stdout.write(`${result.ok ? 'ok' : 'fail'}: ${summary}, ${result.errors} errors, ${result.warnings} warnings\n`)
  }
  process.exit(result.ok ? 0 : 1)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}
