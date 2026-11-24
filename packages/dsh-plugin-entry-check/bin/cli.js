#!/usr/bin/env node
// Exit codes: 0 clean, 1 findings, 2 usage or read error.
import { readFile } from 'node:fs/promises'
import { lintPluginEntry, checkEntryAgainstRepo } from '../src/index.js'

const argv = process.argv.slice(2)
const positional = argv.filter(argument => !argument.startsWith('--'))
const target = positional[0]
const fileFlag = argv.indexOf('--as')
const asName = fileFlag >= 0 ? argv[fileFlag + 1] : undefined
// `--repo <dir>`：一并核对条目说的那个仓库（上游第一号打回原因在 yaml 里看不出来）。
const repoFlag = argv.indexOf('--repo')
const repoDir = repoFlag >= 0 ? argv[repoFlag + 1] : undefined

if (!target) {
  process.stderr.write('usage: dsh-plugin-entry-check <entry.yml|-> [--as owner__repo--path.yml] [--repo <dir>] [--json]\n')
  process.exit(2)
}

try {
  const text = target === '-'
    ? await new Promise(resolve => {
        let data = ''
        process.stdin.on('data', chunk => { data += chunk })
        process.stdin.on('end', () => resolve(data))
      })
    : await readFile(target, 'utf8')
  const filename = asName ?? (target === '-' ? undefined : target)
  const result = repoDir ? checkEntryAgainstRepo(text, repoDir, { filename }) : lintPluginEntry(text, { filename })
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const finding of result.findings) {
      process.stdout.write(`${finding.level} ${finding.rule} 第${finding.line}行 ${finding.message}\n`)
    }
    process.stdout.write(`${result.ok ? 'ok' : 'fail'}: ${result.errors} errors, ${result.warnings} warnings\n`)
  }
  process.exit(result.ok ? 0 : 1)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}
