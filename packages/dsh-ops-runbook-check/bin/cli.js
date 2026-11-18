#!/usr/bin/env node
// Exit codes: 0 clean, 1 findings, 2 usage or read error.
import { readFile } from 'node:fs/promises'
import { lintOpsRunbook } from '../src/index.js'

const args = process.argv.slice(2)
const target = args.find(argument => !argument.startsWith('--'))
if (!target) {
  process.stderr.write('usage: ops-runbook-check <runbook.md> [--json] [--min-steps 3] [--no-require-rollback] [--warnings-fail]\n')
  process.exit(2)
}
const at = args.indexOf('--min-steps')
const rules = {}
if (at !== -1 && args[at + 1]) rules.minSteps = Number(args[at + 1])
if (args.includes('--no-require-rollback')) rules.requireRollback = false
try {
  const result = await lintOpsRunbook(await readFile(target, 'utf8'), rules)
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const finding of result.findings) process.stdout.write(`${finding.level} ${finding.rule} 第${finding.line}行 ${finding.message}\n`)
    process.stdout.write(`${result.ok ? 'ok' : 'fail'}: ${result.checked.steps} steps, ${result.errors} errors, ${result.warnings} warnings\n`)
  }
  process.exit(result.ok ? 0 : 1)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}
