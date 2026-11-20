#!/usr/bin/env node
// 发布前对账：本地版本 vs registry 已发布版本。
//
// 为什么要它：2026-11-20 连着踩了两次 403 —— 「You cannot publish over the
// previously published versions」，因为我按本地版本号猜「这个版本还没发」，而它早就
// 发过了。版本号的真相在 registry，不在 package.json 里。
//
// 用法：node scripts/audit-versions.mjs [--json]
// 退出码：0 全部可发或已对齐；1 有本地版本落后/超前需要处理；2 读取失败。
//
// 注意：这条走网络，所以不进 npm run check（那套要离线可跑）。发布前手动跑一次。
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const registry = process.env.NPM_REGISTRY || 'https://registry.npmjs.org'

async function published(name) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(`${registry}/${name.replace('/', '%2f')}`, { signal: AbortSignal.timeout(30_000) })
      if (res.status === 404) return { latest: null, versions: [] }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      return { latest: body['dist-tags']?.latest ?? null, versions: Object.keys(body.versions ?? {}) }
    } catch (error) {
      if (attempt === 3) return { error: String(error.message || error) }
      await new Promise(done => setTimeout(done, attempt * 2000))
    }
  }
}

const packages = []
for (const dir of readdirSync(resolve(root, 'packages'))) {
  const manifestPath = resolve(root, 'packages', dir, 'package.json')
  if (!existsSync(manifestPath)) continue
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.private) continue
  packages.push({ dir, name: manifest.name, local: manifest.version })
}

const rows = []
for (const pkg of packages) {
  const remote = await published(pkg.name)
  if (remote.error) {
    rows.push({ ...pkg, state: 'unknown', detail: remote.error })
    continue
  }
  const state = !remote.latest
    ? 'new' // 名字还没被占：可以直接发
    : remote.latest === pkg.local
      ? 'aligned' // 已发过这个版本：要么没改动，要么忘了 bump
      : remote.versions.includes(pkg.local)
        ? 'republish' // 这个版本号已经发过，再发会 403
        : 'ahead' // 本地更新：可以发
  rows.push({ ...pkg, state, remote: remote.latest })
}

const bad = rows.filter(row => row.state === 'republish' || row.state === 'unknown')
if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`)
} else {
  for (const row of rows) {
    const mark = { new: 'new  ', aligned: 'same ', ahead: 'ahead', republish: 'BLOCK', unknown: 'ERR  ' }[row.state]
    process.stdout.write(`${mark} ${row.name}@${row.local}${row.remote && row.remote !== row.local ? ` (registry ${row.remote})` : ''}\n`)
  }
  const counts = rows.reduce((acc, row) => ({ ...acc, [row.state]: (acc[row.state] ?? 0) + 1 }), {})
  process.stdout.write(`\n${rows.length} 个包：${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}\n`)
  if (bad.length) process.stdout.write(`\n${bad.length} 个包现在发不出去：bump 版本号，或确认改动已经在这个版本里。\n`)
}
process.exitCode = bad.length ? 1 : 0