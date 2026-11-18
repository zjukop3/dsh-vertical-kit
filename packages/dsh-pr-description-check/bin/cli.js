#!/usr/bin/env node
// Exit codes: 0 clean, 1 findings, 2 usage or read error.
import { readFile } from 'node:fs/promises'
import { lintPrDescription } from '../src/index.js'

const args = process.argv.slice(2)
const target = args.find(argument => !argument.startsWith('--'))
if (!target) {
  process.stderr.write('usage: pr-description-check <pr-body.md|stdin> [--json] [--no-require-why] [--require-issue] [--warnings-fail]\n')
  process.exit(2)
}
const rules = {}
if (args.includes('--no-require-why')) rules.requireWhy = false
if (args.includes('--require-issue')) rules.requireIssue = true
try {
  const text = target === '-' ? await new Promise(resolve => { let data = ''; process.stdin.on('data', chunk => { data += chunk }); process.stdin.on('end', () => resolve(data)) }) : await readFile(target, 'utf8')
  const result = await lintPrDescription(text, rules)
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const finding of result.findings) process.stdout.write(`${finding.level} ${finding.rule} 第${finding.line}行 ${finding.message}\n`)
    process.stdout.write(`${result.ok ? 'ok' : 'fail'}: ${result.checked.boxes} checkboxes, ${result.errors} errors, ${result.warnings} warnings\n`)
  }
  process.exit(result.ok ? 0 : 1)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}
