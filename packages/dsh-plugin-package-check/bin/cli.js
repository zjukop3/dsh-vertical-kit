#!/usr/bin/env node
// Exit codes: 0 clean, 1 findings, 2 usage or read error.
import { existsSync, statSync } from 'node:fs'
import { lintPluginPackage } from '../src/index.js'

const argv = process.argv.slice(2)
const target = argv.find(argument => !argument.startsWith('--'))

if (!target) {
  process.stderr.write('usage: dsh-plugin-package-check <package-dir> [--json]\n')
  process.exit(2)
}

try {
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    process.stderr.write(`不是目录：${target}\n`)
    process.exit(2)
  }
  const dirName = target.replace(/\/+$/, '').split('/').pop()
  const result = lintPluginPackage(target, { dirName })
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const finding of result.findings) {
      process.stdout.write(`${finding.level} ${finding.rule} ${finding.message}\n`)
    }
    process.stdout.write(`${result.ok ? 'ok' : 'fail'}: ${result.checked.package ?? '?'} ${result.errors} errors, ${result.warnings} warnings\n`)
  }
  process.exit(result.ok ? 0 : 1)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}
