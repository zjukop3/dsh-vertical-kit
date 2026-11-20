#!/usr/bin/env node
// Exit codes: 0 clean, 1 findings, 2 usage or read error.
import { readFile } from 'node:fs/promises'
import { lintPrivacyNotice } from '../src/index.js'

const args = process.argv.slice(2)
const target = args.find(argument => !argument.startsWith('--'))
if (!target) {
  process.stderr.write('usage: privacy-notice-check notice.md [--json] [--warnings-fail] [--require-rights]\n')
  process.exit(2)
}
const rules = {}
if (args.includes('--require-rights')) rules.requireRights = true
try {
  const result = await lintPrivacyNotice(await readFile(target, 'utf8'), rules)
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const finding of result.findings) process.stdout.write(`${finding.level} ${finding.rule} 第${finding.line}行 ${finding.message}\n`)
    process.stdout.write(`${result.ok ? 'ok' : 'fail'}: ${result.errors} errors, ${result.warnings} warnings\n`)
  }
  const fail = result.errors > 0 || (args.includes('--warnings-fail') && result.warnings > 0)
  process.exit(fail ? 1 : 0)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}
