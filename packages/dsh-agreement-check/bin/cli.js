#!/usr/bin/env node
// Exit codes: 0 clean, 1 findings, 2 usage or read error.
import { readFile } from 'node:fs/promises'
import { lintContract } from '../src/index.js'

const args = process.argv.slice(2)
const target = args.find(argument => !argument.startsWith('--'))
if (!target) {
  process.stderr.write('usage: agreement-check <contract.md|contract.txt> [--json] [--warnings-fail]\n')
  process.exit(2)
}
try {
  const result = await lintContract(await readFile(target, 'utf8'))
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const finding of result.findings) process.stdout.write(`${finding.level} ${finding.rule} ${finding.message}\n`)
    process.stdout.write(`${result.ok ? 'ok' : 'fail'}: ${result.errors} errors, ${result.warnings} warnings\n`)
  }
  process.exit(!result.ok || (args.includes('--warnings-fail') && result.warnings > 0) ? 1 : 0)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}
