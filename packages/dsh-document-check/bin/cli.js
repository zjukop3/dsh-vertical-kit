#!/usr/bin/env node
// Exit codes: 0 clean, 1 findings, 2 usage or read error.
//
// 这条 CLI 存在的理由不是「再给一个人用」，而是：agent 的工具调用与人的手敲命令必须是
// 同一份实现（都走 lintDocument），否则面板说好的、命令行说不好——这套包从第一天就在防
// 这件事。
//
// 出口码按本仓库的约定只看 errors：warning 是留给人的判断题，不拦交付。
import { readFile } from 'node:fs/promises'
import { lintDocument, SLUGS } from '../src/index.js'

const argv = process.argv.slice(2)
const positional = argv.filter(argument => !argument.startsWith('--'))
const wantJson = argv.includes('--json')
const [check, file] = positional

if (!check || !file) {
  process.stderr.write(
    `usage: dsh-document-check <check> <file|-> [--json]\n\nchecks (${SLUGS.length}):\n  ${SLUGS.join('\n  ')}\n`,
  )
  process.exit(2)
}

try {
  const text = file === '-'
    ? await new Promise(resolve => {
        let data = ''
        process.stdin.on('data', chunk => { data += chunk })
        process.stdin.on('end', () => resolve(data))
      })
    : await readFile(file, 'utf8')
  const result = await lintDocument(check, text)
  if (wantJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    for (const finding of result.findings) {
      process.stdout.write(`${finding.level} ${finding.rule} 第${finding.line}行 ${finding.message}\n`)
    }
    if (result.truncated) process.stdout.write(`(只显示前 ${result.findings.length} 条，修完再跑一次)\n`)
    process.stdout.write(`${result.ok ? 'ok' : 'fail'}: ${result.check} ${result.errors} errors, ${result.warnings} warnings\n`)
  }
  process.exit(result.ok ? 0 : 1)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}