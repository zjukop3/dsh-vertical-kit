// Injects the real input/output example (the same data the site pages embed)
// into each package README, so the npm page shows what the tool does in 30
// seconds instead of describing it. Idempotent: re-running replaces the section.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CHECKS } from './checks-data.mjs'

const root = resolve(import.meta.dirname, '..')
const MARK = '<!-- example:start -->'

for (const check of CHECKS) {
  const path = resolve(root, 'packages', check.npm, 'README.md')
  const text = await readFile(path, 'utf8')
  const section = [
    `${MARK}`,
    '## 真实输入输出',
    '',
    ...(check.example.fixture === null || check.example.fixture === undefined
      ? ['输入：命令里那个包目录（目录型输入，不是一份文档）']
      : ['输入：', '', '```markdown', check.example.fixture, '```']),
    '',
    '真实运行（逐字输出，由测试与工具保持同步）：',
    '',
    '```text',
    check.example.output,
    '```',
    '',
    `出口码：${check.example.exit}。`,
    `${MARK}`,
  ].join('\n')
  const start = text.indexOf(MARK)
  const next = start === -1 ? null : text.indexOf(MARK, start + MARK.length) + MARK.length
  let updated
  if (next !== null) {
    updated = text.slice(0, start) + section + '\n\n' + text.slice(next).replace(/^\s*\n/, '')
  } else {
    const parts = text.split('\n\n')
    if (parts.length < 3) throw new Error(`${check.npm}: README structure unexpected`)
    updated = [parts[0], parts[1], section].join('\n\n') + '\n\n' + parts.slice(2).join('\n\n')
  }
  await writeFile(path, updated)
  console.log(`synced ${check.npm}`)
}
