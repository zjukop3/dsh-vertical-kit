#!/usr/bin/env node
// 生成 dsh-check-suite：一个 bundle，把 27 个检查包一次插进 profile。
//
// 为什么要它：27 个包等于 27 次 `dsh plugin add`，还要 27 次确认。采纳率卡在
// 0 的一部分原因就在这一步的摩擦上——不是东西不好用，是没人愿意点 27 次。
//
// 单一数据源：本仓库 packages/*（22）+ 隔壁 dsh-verify-kit/packages/*（5）。
// 依赖版本、patch 行、条目数全部从这两处的 package.json 推出，脚本里没有一份
// 手写清单（手写清单漏掉 19 个包那次事故，见 docs/metrics/2026-11-20-index-listed-nine.json）。
//
// 用法：node scripts/sync-suite.mjs [--check]
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SUITE_DIR = resolve(root, 'packages/dsh-check-suite')
const SIBLING = resolve(root, '../dsh-verify-kit/packages')
export const SIBLING_HINT = SIBLING

/** 参与 suite 的包：本仓库全部 + 隔壁 verify-kit 全部。 */
export function members(base = root, sibling = SIBLING) {
  const out = []
  for (const dir of [resolve(base, 'packages'), sibling]) {
    if (!existsSync(dir)) continue
    for (const slug of readdirSync(dir).sort()) {
      if (slug === 'dsh-check-suite') continue
      const p = resolve(dir, slug, 'package.json')
      if (!existsSync(p)) continue
      const pkg = JSON.parse(readFileSync(p, 'utf8'))
      if (pkg.private || !pkg.name) continue
      const patchPath = resolve(dir, slug, 'cordis.patch.yml')
      const ownId = existsSync(patchPath)
        ? (readFileSync(patchPath, 'utf8').match(/-\s*id:\s*([\w-]+)/) || [])[1]
        : undefined
      out.push({ dir: resolve(dir, slug), name: pkg.name, version: pkg.version, ownId })
    }
  }
  return out
}

/** patch 里的行 id：check-<去掉 dsh- 前缀与 -check 后缀的 slug>。 */
export function rowId(name) {
  return 'check-' + name.replace(/^dsh-/, '').replace(/-check$/, '').replace(/[^a-z0-9-]/gi, '-')
}

export function patchOf(m = members()) {
  const rows = m.map((x) => `    - id: ${rowId(x.name)}\n      name: '${x.name}'`).join('\n')
  return [
    '# dsh-check-suite: 一次插入全部检查包。每个包自己注入 webServer 并挂载',
    '# 自己的检查端点；这一层只负责把行铺开，不带任何运行时代码。',
    '#',
    '# 行 id 用 check-<slug>，刻意与各包自己 patch 里的 id（<slug>-check）不同，',
    '# 这样两者同时存在时不会被 Loader 判成重复 id。',
    '- insert:',
    rows,
    '',
  ].join('\n')
}

export function depsOf(m = members()) {
  const deps = {}
  for (const x of m) deps[x.name] = `^${x.version}`
  return deps
}

export function manifestOf(m = members()) {
  const dir = resolve(root, 'packages/dsh-commit-msg-check/package.json')
  const upstream = JSON.parse(readFileSync(dir, 'utf8'))
  return {
    name: 'dsh-check-suite',
    version: '0.1.0',
    description:
      'One install for 27 document and delivery checks: commit messages, PR descriptions, release notes, ADRs, runbooks, handovers, invoices, expense claims, resumes, spec and test reports, plus table, outline, number, citation and hash checks. Each check contributes its own HTTP endpoint; every finding carries a line number.',
    type: 'module',
    exports: { './locale/*.json': './locale/*.json', './icon': './icon.svg' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    engines: upstream.engines,
    keywords: [...new Set([...(upstream.keywords || []), 'dsh-bundle', 'check-suite', '检查套件'])],
    license: upstream.license,
    repository: { type: 'git', url: 'git+https://github.com/zjukop3/dsh-vertical-kit.git' },
    dependencies: depsOf(m),
    files: ['cordis.patch.yml', 'locale', 'docs', 'icon.svg', 'README.md', 'LICENSE'],
  }
}

/** 磁盘上应该是什么样：三个文件的内容。 */
export function plan(m = members()) {
  return [
    { file: resolve(SUITE_DIR, 'package.json'), body: JSON.stringify(manifestOf(m), null, 2) + '\n' },
    { file: resolve(SUITE_DIR, 'cordis.patch.yml'), body: patchOf(m) },
  ]
}

export function drift(m = members()) {
  return plan(m).filter((f) => !existsSync(f.file) || readFileSync(f.file, 'utf8') !== f.body)
}

function main() {
  const check = process.argv.includes('--check')
  const m = members()
  if (check) {
    const d = drift(m)
    if (d.length) {
      for (const f of d) console.log(`DRIFT ${f.file.replace(root + '/', '')}`)
      process.exitCode = 1
      return
    }
    console.log(`suite 与 workspace 一致（${m.length} 个成员）`)
    return
  }
  mkdirSync(SUITE_DIR, { recursive: true })
  for (const f of plan(m)) {
    mkdirSync(dirname(f.file), { recursive: true })
    writeFileSync(f.file, f.body)
  }
  console.log(`写入 dsh-check-suite：${m.length} 个成员`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()