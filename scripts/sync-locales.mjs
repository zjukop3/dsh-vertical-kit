#!/usr/bin/env node
// 为每个已发布包生成 locale/en.json 与 locale/zh.json。
//
// 为什么要这一步：Plugin Manager 不激活插件也能读 meta.title / meta.description，
// 缺了它们，插件在列表里只显示包名和 package.json 的英文 description——
// 中文用户看到的是 dsh-citelint 这样的裸标识符，等于没有门面。
//
// 单一数据源：
//   zh 标题/描述 ← scripts/checks-data.mjs 的 CHECKS（跟站点、README 同一份）
//   en 描述      ← 包自己的 package.json description
//   en 标题      ← 本文件的 EN_TITLES（slug 级映射）
//
// EN_TITLES 是手写的，所以 test/locales.test.js 把它钉在从 workspace 推出来的
// 包清单上：漏一个、多一个都报错。手写清单只有在被推导清单钉住时才安全。
//
// 用法：node scripts/sync-locales.mjs [--check]
//   --check 只比较不写入，有差异退出 1（用于 CI 漂移闸）。
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHECKS } from './checks-data.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 英文标题，句子式大小写：只有首词和专有名词大写。 */
export const EN_TITLES = {
  'dsh-adr-check': 'ADR check',
  'dsh-agreement-check': 'Contract structure check',
  'dsh-api-doc-check': 'API doc check',
  'dsh-bug-report-check': 'Bug report check',
  'dsh-commit-msg-check': 'Commit message check',
  'dsh-dockerfile-check': 'Dockerfile check',
  'dsh-env-example-check': 'Env example check',
  'dsh-expense-claim-check': 'Expense claim check',
  'dsh-handover-check': 'Handover doc check',
  'dsh-incident-report-check': 'Incident report check',
  'dsh-invoice-check': 'Invoice check',
  'dsh-license-check': 'License check',
  'dsh-listing-check': 'Listing check',
  'dsh-meeting-notes-check': 'Meeting notes check',
  'dsh-onboarding-check': 'Onboarding doc check',
  'dsh-ops-runbook-check': 'Ops runbook check',
  'dsh-pr-description-check': 'PR description check',
  'dsh-release-notes-check': 'Release notes check',
  'dsh-resume-check': 'Resume check',
  'dsh-spec-doc-check': 'Spec doc check',
  'dsh-test-report-check': 'Test report check',
  'dsh-weekly-report-check': 'Weekly report check',
}

/** workspace 里所有已发布包（目录名 + package.json + 对应的 CHECKS 条目）。 */
export function publishedPackages(base = root) {
  const dataDir = resolve(base, 'packages')
  const byNpm = new Map(CHECKS.map((c) => [c.npm, c]))
  const out = []
  for (const dir of readdirSync(dataDir).sort()) {
    const pkgPath = resolve(dataDir, dir, 'package.json')
    if (!existsSync(pkgPath)) continue
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    if (pkg.private) continue
    // 只有检查包才有 CHECKS 条目；dsh-check-suite 这类 bundle 的 locale 是手写的，
    // 用推导出的条目集合排除，而不是再写一份名单。
    if (!byNpm.has(pkg.name)) continue
    out.push({ dir: resolve(dataDir, dir), name: pkg.name, pkg, entry: byNpm.get(pkg.name) })
  }
  return out
}

/** 一个包应有的两份 locale 内容。 */
export function localeFor(p) {
  const enTitle = EN_TITLES[p.name]
  if (!enTitle) throw new Error(`${p.name} 缺英文标题（补 EN_TITLES）`)
  if (!p.entry) throw new Error(`${p.name} 在 checks-data.mjs 的 CHECKS 里没有条目`)
  return {
    en: { meta: { title: enTitle, description: p.pkg.description } },
    zh: { meta: { title: p.entry.title, description: p.entry.description } },
  }
}

/** 生成计划：每个包里两个文件的路径与内容。 */
export function plan(base = root) {
  return publishedPackages(base).flatMap((p) => {
    const { en, zh } = localeFor(p)
    return [
      { pkg: p.name, file: resolve(p.dir, 'locale/en.json'), body: JSON.stringify(en, null, 2) + '\n' },
      { pkg: p.name, file: resolve(p.dir, 'locale/zh.json'), body: JSON.stringify(zh, null, 2) + '\n' },
    ]
  })
}

/** 哪些文件和磁盘不一致（--check 用）。 */
export function drift(base = root) {
  const files = plan(base).filter((f) => {
    if (!existsSync(f.file)) return true
    return readFileSync(f.file, 'utf8') !== f.body
  })
  const unwired = publishedPackages(base)
    .filter((p) => !wired(p.pkg))
    .map((p) => ({ pkg: p.name, file: resolve(p.dir, 'package.json'), body: '' }))
  return [...files, ...unwired]
}

/** package.json 是否已经把 locale 暴露出去（exports + files）。 */
export function wired(pkg) {
  const exportsOk = Boolean(pkg.exports?.['./locale/*.json'])
  const filesOk = Array.isArray(pkg.files) && pkg.files.includes('locale')
  return exportsOk && filesOk
}

/** 幂等地把 locale 写进 package.json 的 exports 与 files；返回是否有改动。 */
export function wireManifest(dir) {
  const pkgPath = resolve(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (wired(pkg)) return false
  pkg.exports = { ...(pkg.exports || {}), './locale/*.json': './locale/*.json' }
  if (!Array.isArray(pkg.files)) pkg.files = []
  if (!pkg.files.includes('locale')) pkg.files = [...pkg.files, 'locale']
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  return true
}

function main() {
  const check = process.argv.includes('--check')
  if (check) {
    const d = drift()
    if (d.length) {
      for (const f of d) console.log(`DRIFT ${f.pkg} ${f.file.replace(root + '/', '')}`)
      console.log(`\n${d.length} 个文件与生成器不一致；跑 node scripts/sync-locales.mjs`)
      process.exitCode = 1
      return
    }
    console.log('locale 与生成器一致')
    return
  }
  let n = 0
  for (const f of plan()) {
    mkdirSync(dirname(f.file), { recursive: true })
    writeFileSync(f.file, f.body)
    n += 1
  }
  let w = 0
  for (const pk of publishedPackages()) {
    if (wireManifest(pk.dir)) w += 1
  }
  console.log(`写入 ${n} 个 locale 文件（${n / 2} 个包），接线 ${w} 个 package.json`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()