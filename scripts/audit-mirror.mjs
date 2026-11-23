#!/usr/bin/env node
// 镜像站对账：npmjs 上的 latest vs 国内镜像（registry.npmmirror.com）上的 latest。
//
// 为什么要它：2026-11-23 在一个干净 profile 里 `dsh plugin add dsh-check-suite`，
// pnpm 报
//   ERR_PNPM_TARBALL_EXTRACT  Failed to add tarball from
//   "https://registry.npmmirror.com/dsh-check-suite/-/dsh-check-suite-0.0.0-stage.tgz"
//   to store: Invalid checksum for TAR header
// 而 npmjs 上 latest 明明是 0.1.0。真问题不是 tarball，是镜像的 dist-tags.latest
// 永远停在了那个先发的 0.0.0-stage 占位包上——名字首发的「只能发 stage」陷阱，
// 在镜像侧留下了一个只有 2 个文件、337 字节的空壳，并被标成 latest。
// 也就是说：装不上的不是我包里的代码，是镜像的 latest 指针。任何人（尤其国内
// 用户，~/.npmrc 默认就指向 npmmirror）按 README 敲一条命令都会撞上它。
//
// 用法：
//   node scripts/audit-mirror.mjs                 只对账，不改状态
//   node scripts/audit-mirror.mjs --sync          对漂移的包触发镜像同步
//   node scripts/audit-mirror.mjs --sync --wait 120   触发后轮询直到收敛或超时
//   node scripts/audit-mirror.mjs --json          机器可读
// 退出码：0 全部对齐；1 有漂移；2 读取失败（网络）。
//
// 注意：走网络，不进 npm run check（那套要离线可跑）。发版后手动跑一次。
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const UPSTREAM = process.env.NPM_REGISTRY || 'https://registry.npmjs.org'
const MIRROR = process.env.NPM_MIRROR || 'https://registry.npmmirror.com'

const args = process.argv.slice(2)
const wantSync = args.includes('--sync')
const wantJson = args.includes('--json')
const waitIndex = args.indexOf('--wait')
const waitSeconds = waitIndex === -1 ? 0 : Number(args[waitIndex + 1] || 0)

// ── 版本比较 ────────────────────────────────────────────────────────────────
// 这里刻意不写字符串比较：`0.1.10 > 0.1.9` 在字典序里是假的，`0.0.0-stage` 与
// `0.0.0` 在字典序里也分不出预发布该更低。判据要落在「哪个更新」这个属性上。
export function compareVersions(a, b) {
  const parse = v => {
    const [core, ...rest] = String(v).trim().split('-')
    const nums = core.split('.').map(n => Number.parseInt(n, 10))
    return { nums: [nums[0] || 0, nums[1] || 0, nums[2] || 0], pre: rest.join('-') }
  }
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < 3; i += 1) {
    if (left.nums[i] !== right.nums[i]) return left.nums[i] < right.nums[i] ? -1 : 1
  }
  if (left.pre === right.pre) return 0
  if (!left.pre) return 1 // 正式版高于同号预发布
  if (!right.pre) return -1
  return left.pre < right.pre ? -1 : 1
}

// ── 判定 ────────────────────────────────────────────────────────────────────
// 判据是「镜像能不能让读者按 README 装到东西」，不是「两个字符串相等」。
export function classify({ upstreamLatest, mirrorLatest, mirrorVersions = [] }) {
  if (!mirrorLatest) return 'missing' // 镜像还不知道这个包
  if (upstreamLatest && compareVersions(mirrorLatest, upstreamLatest) === 0) return 'ok'
  if (upstreamLatest && compareVersions(mirrorLatest, upstreamLatest) < 0) {
    // 镜像落后：如果它只认识预发布占位版，那就是「latest 卡在 stage」这类故障，
    // 读者拿到的不是旧版本，而是一个空壳。
    const placeholders = mirrorVersions.filter(v => v.includes('-'))
    if (mirrorVersions.length > 0 && placeholders.length === mirrorVersions.length) return 'stale-stage'
    return 'behind'
  }
  return 'forked' // 镜像比 npmjs 还新：镜像自己在超前，要人看一眼
}

// ── 读取 ────────────────────────────────────────────────────────────────────
async function read(registry, name) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(`${registry}/${name}`, { signal: AbortSignal.timeout(30_000) })
      if (res.status === 404) return { latest: null, versions: [] }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      return { latest: body['dist-tags']?.latest ?? null, versions: Object.keys(body.versions ?? {}) }
    } catch (error) {
      if (attempt === 3) return { error: String(error.message || error) }
      await new Promise(done => setTimeout(done, attempt * 1500))
    }
  }
}

async function triggerSync(name) {
  try {
    const res = await fetch(`${MIRROR}/${name}/sync`, { method: 'PUT', signal: AbortSignal.timeout(30_000) })
    const body = await res.text()
    return { status: res.status, body: body.slice(0, 120) }
  } catch (error) {
    return { status: 0, body: String(error.message || error) }
  }
}

// 对账范围是「读者照 README 装完之后机器上会有的东西」，不是「这个仓库里有什么」。
// 所以除了本地各包，还要把 suite 的依赖并进来：那 27 个里有一部分并不住在本仓库
// （dsh-citelint / dsh-hashcheck / dsh-numberlint / dsh-outline-lint / dsh-tablelint
// 在 dsh-verify-kit），但读者 `dsh plugin add dsh-check-suite` 一样会把它们装上；
// 只清点本地目录会漏掉它们，而镜像漂移恰恰出在其中一个身上。
function auditedPackages() {
  const out = []
  const seen = new Set()
  for (const dir of readdirSync(resolve(root, 'packages'))) {
    const manifestPath = resolve(root, 'packages', dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest.private) continue
    seen.add(manifest.name)
    out.push({ dir, name: manifest.name, local: manifest.version, external: false })
  }
  const suiteManifest = resolve(root, 'packages', 'dsh-check-suite', 'package.json')
  if (existsSync(suiteManifest)) {
    const suite = JSON.parse(readFileSync(suiteManifest, 'utf8'))
    for (const name of Object.keys(suite.dependencies ?? {})) {
      if (seen.has(name)) continue
      seen.add(name)
      out.push({ dir: null, name, local: null, external: true })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

async function measure(packages) {
  const rows = []
  for (const pkg of packages) {
    const [up, mirror] = await Promise.all([read(UPSTREAM, pkg.name), read(MIRROR, pkg.name)])
    if (up.error || mirror.error) {
      rows.push({ ...pkg, state: 'unknown', detail: up.error ? `npmjs: ${up.error}` : `mirror: ${mirror.error}` })
      continue
    }
    rows.push({
      ...pkg,
      upstreamLatest: up.latest,
      mirrorLatest: mirror.latest,
      mirrorVersions: mirror.versions,
      state: classify({ upstreamLatest: up.latest, mirrorLatest: mirror.latest, mirrorVersions: mirror.versions }),
    })
  }
  return rows
}

export async function main() {
  const packages = auditedPackages()
  let rows = await measure(packages)

  if (wantSync) {
    const drifted = rows.filter(row => row.state !== 'ok' && row.state !== 'unknown')
    for (const row of drifted) {
      const result = await triggerSync(row.name)
      if (!wantJson) console.log(`sync ${row.name}: ${result.status} ${result.body}`)
    }
    const deadline = Date.now() + Math.max(waitSeconds, 0) * 1000
    if (drifted.length > 0 && waitSeconds > 0) {
      while (Date.now() < deadline) {
        await new Promise(done => setTimeout(done, 10_000))
        rows = await measure(packages.filter(pkg => drifted.some(row => row.name === pkg.name)))
        if (rows.every(row => row.state === 'ok' || row.state === 'unknown')) break
      }
    }
  }

  const driftedRows = rows.filter(row => row.state !== 'ok')
  if (wantJson) {
    console.log(JSON.stringify({ upstream: UPSTREAM, mirror: MIRROR, rows }, null, 2))
  } else {
    const icon = { ok: '  ', behind: '!!', 'stale-stage': '!!', missing: '!!', forked: '??', unknown: '??' }
    console.log(`npmjs: ${UPSTREAM}\nmirror: ${MIRROR}\n`)
    for (const row of rows) {
      const state = row.state === 'ok' ? '' : ` ${row.state}`
      const detail = row.state === 'unknown' ? ` (${row.detail})` : ''
      console.log(
        `${icon[row.state]} ${row.name.padEnd(30)} npmjs=${String(row.upstreamLatest ?? '-').padEnd(10)} mirror=${
          String(row.mirrorLatest ?? '-').padEnd(12)
        }${state}${detail}`,
      )
    }
    console.log(`\n${rows.length - driftedRows.length}/${rows.length} 对齐；漂移 ${driftedRows.length}`)
    if (driftedRows.length > 0 && !wantSync) {
      console.log('镜像漂移会让国内读者按 README 装到旧版或空壳占位包。修复：加 --sync --wait 120 触发重新抓取。')
    }
  }
  return driftedRows.length === 0 ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().then(code => process.exit(code)).catch(error => {
    console.error(`镜像对账失败：${error.message || error}`)
    process.exit(2)
  })
}