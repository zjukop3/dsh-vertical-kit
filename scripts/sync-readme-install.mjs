#!/usr/bin/env node
// 在每个检查的 README 里补一段「装进 DSH」——因为读者拿到的第一屏只说 npx，而 33 个检查
// 每一个都注册了 host 路由，装进 profile 才能在对话里用。
//
// 2026-11-24：`dsh-plugin-package-check` 在本仓库自己的包上跑出 27 条 readme-install-missing。
// 那不是规则挑剔：README 里确实没有一行 `dsh plugin add`，读者只能自己猜——而 `--profile`
// 还是 dsh plugin 的必填项，猜错就是 `error: --profile <name> is required`。
//
// 用法：
//   node scripts/sync-readme-install.mjs           写入或刷新
//   node scripts/sync-readme-install.mjs --check   只比对
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHECKS } from './checks-data.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const START = '<!-- install:start -->'
const END = '<!-- install:end -->'

export function installSection(check) {
  return [
    START,
    '## 装进 DSH',
    '',
    '```bash',
    `dsh plugin --profile <profile> add ${check.npm}`,
    '```',
    '',
    `\`--profile\` 是 \`dsh plugin\` 的必填项（Desktop 用 \`desktop\`，Web 用 \`web\`）。装完在「插件」里启用，对话中就有这条检查的 host 路由；不装 DSH 也能用上面的 \`npx\`。`,
    END,
  ].join('\n')
}

/** 幂等：已有 install 块就地替换，没有就插在第一个二级标题之前。 */
export function withInstallSection(text, check) {
  const start = text.indexOf(START)
  if (start !== -1) {
    const end = text.indexOf(END, start)
    if (end === -1) throw new Error(`${check.npm}: install 块没有闭合标记`)
    return `${text.slice(0, start).replace(/\s+$/, '\n\n')}${installSection(check)}${text.slice(end + END.length)}`
  }
  const firstSection = text.search(/\n## /)
  if (firstSection === -1) return `${text.trimEnd()}\n\n${installSection(check)}\n`
  const head = text.slice(0, firstSection).replace(/\s+$/, '')
  return `${head}\n\n${installSection(check)}\n${text.slice(firstSection)}`
}

export async function plan() {
  const out = []
  for (const check of CHECKS) {
    const path = resolve(root, 'packages', check.npm, 'README.md')
    if (!existsSync(path)) continue
    const current = await readFile(path, 'utf8')
    out.push({ file: path, body: withInstallSection(current, check) })
  }
  return out
}

async function main() {
  const checkOnly = process.argv.includes('--check')
  const files = await plan()
  const drift = []
  for (const entry of files) {
    const current = await readFile(entry.file, 'utf8')
    if (current !== entry.body) drift.push(entry)
  }
  if (checkOnly) {
    if (drift.length > 0) {
      console.error(`DRIFT ${drift.length} 个 README 缺安装块：${drift.map(entry => entry.file.replace(`${root}/`, '')).join(', ')}`)
      return 1
    }
    console.log('每个检查的 README 都有「装进 DSH」一段')
    return 0
  }
  for (const entry of drift) await writeFile(entry.file, entry.body)
  console.log(`更新 ${drift.length} 个 README`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().then(code => process.exit(code)).catch(error => {
    console.error(`写入安装块失败：${error.message || error}`)
    process.exit(2)
  })
}