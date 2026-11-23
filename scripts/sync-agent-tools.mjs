#!/usr/bin/env node
// 生成 dsh-document-check 的检查清单与依赖：一条工具、31 个检查。
//
// 为什么要生成而不是手写：这份清单决定 agent 能调用哪些检查。手写一版，新加一个检查包时
// 就会漏——而漏掉的表现是「工具说没有这个检查」，看起来像检查不存在，其实是清单过期。
// 生成器从两处真相推导：本仓库的 checks-data.mjs（27 个场景检查）和隔壁 verify-kit 的
// 包目录（4 个文本检查）。hashcheck 不在里面——它算摘要，不是文本检查。
//
// 用法：
//   node scripts/sync-agent-tools.mjs          写入生成文件与依赖
//   node scripts/sync-agent-tools.mjs --check  只比对，不写
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const KIT = resolve(root, 'packages/dsh-document-check')
const SIBLING = resolve(root, '../dsh-verify-kit/packages')

// verify-kit 的四个文本检查。导出名写死在这里，因为它们的名字不统一（lintCitations /
// lintNumbers / lintOutline / lintTables），按前缀猜会猜错：第一版写成 checkNumbering，
// 而那个函数收的是「引文定义数组」不是文本，工具一调就崩。写死的那部分由 test 断言存在，
// 且每个都要真的跑一次。
const VERIFY_KIT = [
  { slug: 'citelint', pkg: 'dsh-citelint', exportName: 'lintCitations' },
  { slug: 'numberlint', pkg: 'dsh-numberlint', exportName: 'lintNumbers' },
  { slug: 'outline-lint', pkg: 'dsh-outline-lint', exportName: 'lintOutline' },
  { slug: 'tablelint', pkg: 'dsh-tablelint', exportName: 'lintTables' },
]

/** 一个包里唯一的 lint* 导出。多于一个或没有就报错——那说明包的形状变了，别猜。 */
async function lintExportOf(dir) {
  const mod = await import(resolve(dir, 'src', 'index.js'))
  const names = Object.keys(mod).filter(key => /^lint[A-Z]/.test(key) && typeof mod[key] === 'function')
  if (names.length !== 1) throw new Error(`${dir}: 期望恰好一个 lint* 导出，实际 [${names.join(', ')}]`)
  return names[0]
}

async function members() {
  const { CHECKS } = await import(resolve(root, 'scripts', 'checks-data.mjs'))
  const out = []
  for (const check of CHECKS) {
    const dir = resolve(root, 'packages', check.npm)
    const manifest = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'))
    out.push({ slug: check.slug, pkg: manifest.name, version: manifest.version, exportName: await lintExportOf(dir), genre: check.noun ?? check.title })
  }
  for (const entry of VERIFY_KIT) {
    const dir = resolve(SIBLING, entry.pkg)
    const manifest = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'))
    const mod = await import(resolve(dir, 'src', 'index.js'))
    if (typeof mod[entry.exportName] !== 'function') throw new Error(`${entry.pkg}: 没有导出 ${entry.exportName}`)
    out.push({ slug: entry.slug, pkg: manifest.name, version: manifest.version, exportName: entry.exportName, genre: entry.slug })
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug))
}

export function generatedSource(list) {
  const header = `// 由 scripts/sync-agent-tools.mjs 生成，勿手改。
// ${list.length} 个检查：本仓库 ${list.length - VERIFY_KIT.length} 个 + verify-kit ${VERIFY_KIT.length} 个。
// 手改的话，新加一个检查包时这条工具会静默漏掉它——而报错看起来像「没有这个检查」。
export const CHECKS = [`
  const rows = list
    .map(entry => `  { slug: '${entry.slug}', pkg: '${entry.pkg}', exportName: '${entry.exportName}', genre: ${JSON.stringify(entry.genre)} },`)
    .join('\n')
  return `${header}\n${rows}\n]\n\nexport const SLUGS = CHECKS.map(entry => entry.slug)\n\nexport const BY_SLUG = new Map(CHECKS.map(entry => [entry.slug, entry]))\n`
}

export function generatedDependencies(list) {
  const deps = {}
  for (const entry of list) deps[entry.pkg] = `^${entry.version}`
  return deps
}

export async function plan() {
  const list = await members()
  const manifestPath = resolve(KIT, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const nextManifest = { ...manifest, dependencies: generatedDependencies(list) }
  return [
    { file: resolve(KIT, 'src/checks.generated.js'), body: generatedSource(list) },
    { file: manifestPath, body: `${JSON.stringify(nextManifest, null, 2)}\n` },
  ]
}

async function main() {
  const checkOnly = process.argv.includes('--check')
  const files = await plan()
  const drift = []
  for (const file of files) {
    const current = existsSync(file.file) ? await readFile(file.file, 'utf8') : null
    if (current !== file.body) drift.push(file.file)
  }
  if (checkOnly) {
    if (drift.length > 0) {
      console.error(`DRIFT ${drift.map(file => file.replace(`${root}/`, '')).join(', ')}`)
      console.error('跑 node scripts/sync-agent-tools.mjs 重新生成。')
      return 1
    }
    console.log('document-check 的清单与依赖与 workspace 一致')
    return 0
  }
  for (const file of files) await writeFile(file.file, file.body)
  const list = await members()
  console.log(`写入 dsh-document-check：${list.length} 个检查（${list.length - VERIFY_KIT.length} 本仓 + ${VERIFY_KIT.length} verify-kit）`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().then(code => process.exit(code)).catch(error => {
    console.error(`生成失败：${error.message || error}`)
    process.exit(2)
  })
}