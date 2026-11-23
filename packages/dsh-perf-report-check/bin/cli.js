#!/usr/bin/env node
// Exit codes: 0 clean, 1 findings, 2 usage or read error.
import { readFile } from 'node:fs/promises'
import { lintPerfReport } from '../src/index.js'

const args = process.argv.slice(2)
const target = args.find(argument => !argument.startsWith('--'))
if (!target) {
  process.stderr.write('usage: perf-report-check report.md [--json] [--warnings-fail] [--strict]\n')
  process.exit(2)
}
const rules = {}
if (args.includes('--strict')) rules.strict = true
try {
  const result = await lintPerfReport(await readFile(target, 'utf8'), rules)
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const f of result.findings) process.stdout.write(`${f.level} ${f.rule} 第${f.line}行 ${f.message}\n`)
    process.stdout.write(`${result.ok ? 'ok' : 'fail'}: ${result.checked.percentiles} percentiles, ${result.errors} errors, ${result.warnings} warnings\n`)
  }
  const fail = result.errors > 0 || (args.includes('--warnings-fail') && result.warnings > 0)
  process.exit(fail ? 1 : 0)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}
