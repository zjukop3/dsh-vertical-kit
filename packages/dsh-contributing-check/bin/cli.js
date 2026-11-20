#!/usr/bin/env node
// Exit codes: 0 clean, 1 findings, 2 usage or read error.
import { readFile } from 'node:fs/promises'
import { lintContributing } from '../src/index.js'

const args = process.argv.slice(2)
const target = args.find(argument => !argument.startsWith('--'))
if (!target) {
  process.stderr.write('usage: contributing-check CONTRIBUTING.md [--json] [--warnings-fail] [--strict]\n')
  process.exit(2)
}
const rules = {}
if (args.includes('--strict')) rules.strict = true
try {
  const result = await lintContributing(await readFile(target, 'utf8'), rules)
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const finding of result.findings) process.stdout.write(`${finding.level} ${finding.rule} 第${finding.line}行 ${finding.message}\n`)
    process.stdout.write(`${result.ok ? 'ok' : 'fail'}: ${result.checked.commands} commands, ${result.errors} errors, ${result.warnings} warnings\n`)
  }
  const fail = result.errors > 0 || (args.includes('--warnings-fail') && result.warnings > 0)
  process.exit(fail ? 1 : 0)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}
