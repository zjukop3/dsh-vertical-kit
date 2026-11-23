#!/usr/bin/env node
// Exit codes: 0 clean, 1 findings, 2 usage or read error. The same function the
// host route calls, so a check that passes here cannot fail in the panel.
import { readFile } from 'node:fs/promises'
import { lintTables } from '../src/index.js'

const args = process.argv.slice(2)
const target = args.find(argument => !argument.startsWith('--'))
if (!target) {
  process.stderr.write('usage: tablelint <file.md> [--warnings-fail]\n')
  process.exit(2)
}
const asJson = args.includes('--json')
try {
  const result = await lintTables(await readFile(target, 'utf8'))
  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const finding of result.findings) process.stdout.write(`${finding.level} ${finding.rule} ${finding.message}\n`)
    process.stdout.write(`${result.ok ? 'ok' : 'fail'}: ${result.errors} errors, ${result.warnings} warnings\n`)
  }
  const failed = !result.ok || (args.includes('--warnings-fail') && result.warnings > 0)
  process.exit(failed ? 1 : 0)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}
