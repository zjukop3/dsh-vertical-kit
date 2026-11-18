#!/usr/bin/env node
// Exit codes: 0 clean, 1 findings, 2 usage or read error.
import { readFile } from 'node:fs/promises'
import { lintCommitMessage } from '../src/index.js'

const args = process.argv.slice(2)
const target = args.find(argument => !argument.startsWith('--'))
if (!target) {
  process.stderr.write('usage: commit-msg-check <COMMIT_EDITMSG|msg.txt> [--json] [--max-subject 72] [--warnings-fail]\n')
  process.exit(2)
}
const option = name => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : Number(args[at + 1])
}
const rules = {}
const maxSubject = option('--max-subject')
if (maxSubject !== undefined) rules.maxSubject = maxSubject
try {
  const result = await lintCommitMessage(await readFile(target, 'utf8'), rules)
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const finding of result.findings) process.stdout.write(`${finding.level} ${finding.rule} 第${finding.line}行 ${finding.message}\n`)
    process.stdout.write(`${result.ok ? 'ok' : 'fail'}: type=${result.checked.type ?? '-'} subject=${result.checked.subject ?? '-'}ch, ${result.errors} errors, ${result.warnings} warnings\n`)
  }
  process.exit(result.ok ? 0 : 1)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}
