#!/usr/bin/env node
// Exit codes: 0 clean, 1 findings, 2 usage or read error.
import { readFile } from 'node:fs/promises'
import { lintListings } from '../src/index.js'

const args = process.argv.slice(2)
const target = args.find(argument => !argument.startsWith('--'))
if (!target) {
  process.stderr.write('usage: listing-check <listings.csv|listings.json> [--json] [--min-title 10] [--max-title 60] [--max-price 9999] [--warnings-fail]\n')
  process.exit(2)
}
const option = name => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : Number(args[at + 1])
}
const rules = {}
for (const key of ['minTitle', 'maxTitle', 'minPrice', 'maxPrice', 'maxRepeats']) {
  const value = option(`--${key.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`)}`)
  if (value !== undefined) rules[key] = value
}
try {
  const result = await lintListings(await readFile(target, 'utf8'), rules)
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const finding of result.findings) process.stdout.write(`${finding.level} ${finding.rule} 第${finding.row}行 ${finding.message}\n`)
    process.stdout.write(`${result.ok ? 'ok' : 'fail'}: ${result.checked} rows, ${result.errors} errors, ${result.warnings} warnings\n`)
  }
  process.exit(result.ok ? 0 : 1)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}
