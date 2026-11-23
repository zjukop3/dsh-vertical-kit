#!/usr/bin/env node
// Exit codes: 0 clean, 1 findings, 2 usage or read error.
import { readFile } from 'node:fs/promises'
import { lintTestReport } from '../src/index.js'

const args = process.argv.slice(2)
const target = args.find(argument => !argument.startsWith('--'))
if (!target) {
  process.stderr.write('usage: test-report-check report.md [--json] [--warnings-fail]\n')
  process.exit(2)
}
const rules = {}
try {
  const result = await lintTestReport(await readFile(target, 'utf8'), rules)
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const finding of result.findings) process.stdout.write(`${finding.level} ${finding.rule} 第${finding.line}行 ${finding.message}\n`)
    // 性能报告分支没有 counts 可印；印 null 和印 undefined 一样是丑。
    // 该文体就明说文体，别把 JSON 的 null 漏到人眼前。
    const summary = result.checked.performanceReport ? 'performance report' : JSON.stringify(result.checked.counts)
    process.stdout.write(`${result.ok ? 'ok' : 'fail'}: ${summary}, ${result.errors} errors, ${result.warnings} warnings` + '\n')
  }
  process.exit(result.ok ? 0 : 1)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}
