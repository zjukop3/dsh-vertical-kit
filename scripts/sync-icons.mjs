#!/usr/bin/env node
// 给每个包装上图标——因为插件市场里没有图标的卡片是空白的。
//
// 2026-11-24：`dsh-plugin-package-check` 在本仓库自己的 30 个包上跑出 27 条 icon-missing。
// 那 27 个包在目录里各占一行，卡片全是空白——不是功能问题，是「看起来像没人维护」的问题。
// 逐个手画 27 个图标没意义，也不该有 27 种风格；按族给 6 个字形，同族同形，读者扫一眼能分组。
//
// 用法：
//   node scripts/sync-icons.mjs           写入缺少的 icon.svg，并把 exports/files 补上
//   node scripts/sync-icons.mjs --check   只比对，不写
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const LIGHT = '#9ec5ff'
const BLUE = '#1f6feb'
const GREEN = '#16a34a'

/** 六个族：字形 + 一句话说这族判什么。slug 关键字决定归属，顺序即优先级。 */
const FAMILIES = [
  {
    id: 'money',
    match: /invoice|expense|agreement|listing/,
    glyph: `<path d="M12 5.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6z" fill="#fff" opacity=".92"/><path d="M12 8.2v7.6M10.2 9.8h3.2M10.2 14.2h3.2" stroke="${BLUE}" stroke-width="1.4" stroke-linecap="round"/>`,
  },
  {
    id: 'people',
    match: /resume|handover|meeting|weekly/,
    glyph: `<circle cx="12" cy="9.4" r="2.9" fill="#fff" opacity=".92"/><path d="M6.6 17.6c0-2.6 2.4-4.3 5.4-4.3s5.4 1.7 5.4 4.3" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" opacity=".92"/>`,
  },
  {
    id: 'ops',
    match: /runbook|incident|security-advisory/,
    glyph: `<path d="M12 5.4 18.6 8v6.2c0 2.4-2.7 4.3-6.6 5.4-3.9-1.1-6.6-3-6.6-5.4V8z" fill="#fff" opacity=".92"/><path d="m9.6 12.4 2 2 3.4-3.6" fill="none" stroke="${GREEN}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    id: 'legal',
    match: /license|privacy|contributing|spec-doc/,
    glyph: `<path d="M7 5.5h7.4L18 9v9.5H7z" fill="#fff" opacity=".92"/><path d="M14.2 5.5v3.8h3.8" fill="${LIGHT}"/><path d="M9 12.4h6M9 14.6h4.2" stroke="${BLUE}" stroke-width="1.3" stroke-linecap="round"/>`,
  },
  {
    id: 'delivery',
    match: /release|migration|onboarding|api-doc|test-report/,
    glyph: `<path d="M6.4 12.6 3.8 17l4.6-.6 2.4 2.4 1-3.4z" fill="${LIGHT}"/><path d="M12.2 4.6h7.2v7.2l-7 7-7.2-7.2z" fill="#fff" opacity=".92"/><circle cx="15.6" cy="8.4" r="1.5" fill="${BLUE}"/>`,
  },
  {
    id: 'engineering',
    match: /commit-msg|dockerfile|env-example|pr-description|bug-report|adr|perf-report/,
    glyph: `<path d="M9.8 4.8h4.4v4.2h-4.4zM4.8 15.4h4.4v4.2H4.8zM14.8 15.4h4.4v4.2h-4.4z" fill="#fff" opacity=".92"/><path d="M12 9v3.2M7 15.4v-2.2h10v2.2" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".92"/>`,
  },
]

const FALLBACK = {
  id: 'catalog',
  glyph: `<path d="M7 5.5h7.4L18 9v9.5H7z" fill="#fff" opacity=".92"/><path d="M14.2 5.5v3.8h3.8" fill="${LIGHT}"/><path d="M8.4 11.6h5.4M8.4 13.6h3.6" stroke="${BLUE}" stroke-width="1.3" stroke-linecap="round"/><path d="m10 17.4 1.3 1.2 2.6-2.6" fill="none" stroke="${GREEN}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
}

export function familyOf(slug) {
  for (const family of FAMILIES) if (family.match.test(slug)) return family
  return FALLBACK
}

export function iconSource(slug) {
  const family = familyOf(slug)
  const label = slug.replace(/^dsh-/, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="${label}">
  <rect x="1.5" y="1.5" width="21" height="21" rx="4.5" fill="${BLUE}"/>
  ${family.glyph}
</svg>
`
}

async function packages() {
  const dir = resolve(root, 'packages')
  const out = []
  for (const slug of await readdir(dir)) {
    const manifestPath = resolve(dir, slug, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (manifest.private) continue
    out.push({ dir: resolve(dir, slug), slug, manifest, manifestPath })
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug))
}

export async function plan() {
  const files = []
  for (const pkg of await packages()) {
    const iconPath = resolve(pkg.dir, 'icon.svg')
    const source = iconSource(pkg.slug)
    // 已经有图标的包不覆盖：手画的那几个（套件、工具、两个目录包）比族图标具体。
    if (!existsSync(iconPath)) files.push({ file: iconPath, body: source, kind: 'icon' })
    const manifest = { ...pkg.manifest }
    let touched = false
    if (!manifest.exports?.['./icon']) {
      manifest.exports = { ...(manifest.exports ?? {}), './icon': './icon.svg' }
      touched = true
    }
    if (Array.isArray(manifest.files) && !manifest.files.includes('icon.svg')) {
      manifest.files = [...manifest.files, 'icon.svg']
      touched = true
    }
    if (touched) files.push({ file: pkg.manifestPath, body: `${JSON.stringify(manifest, null, 2)}\n`, kind: 'manifest' })
  }
  return files
}

async function main() {
  const checkOnly = process.argv.includes('--check')
  const files = await plan()
  const drift = []
  for (const entry of files) {
    const current = existsSync(entry.file) ? await readFile(entry.file, 'utf8') : null
    if (current !== entry.body) drift.push(entry)
  }
  if (checkOnly) {
    if (drift.length > 0) {
      console.error(`DRIFT ${drift.map(entry => entry.file.replace(`${root}/`, '')).join(', ')}`)
      console.error('跑 node scripts/sync-icons.mjs 生成。')
      return 1
    }
    console.log('每个包的图标与 exports 都齐了')
    return 0
  }
  for (const entry of drift) await writeFile(entry.file, entry.body)
  const icons = drift.filter(entry => entry.kind === 'icon').length
  console.log(`写入 ${icons} 个图标，${drift.length - icons} 个 package.json`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().then(code => process.exit(code)).catch(error => {
    console.error(`生成图标失败：${error.message || error}`)
    process.exit(2)
  })
}