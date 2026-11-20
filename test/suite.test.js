import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { members, rowId, depsOf, drift, SIBLING_HINT } from '../scripts/sync-suite.mjs'
import { CHECKS } from '../scripts/checks-data.mjs'

const verifyKitCount = () =>
  readdirSync(resolve(ROOT, '../dsh-verify-kit/packages')).filter((s) =>
    existsSync(resolve(ROOT, '../dsh-verify-kit/packages', s, 'package.json')),
  ).length

const ROOT = resolve(import.meta.dirname, '..')
const SUITE = resolve(ROOT, 'packages/dsh-check-suite')
const CJK = /[\u4e00-\u9fff]/g
const cjkRatio = (t) => {
  const v = String(t).replace(/\s/g, '')
  return v ? (v.match(CJK) || []).length / v.length : 0
}

test('suite 成员 = 本仓 CHECKS 里的每个检查 + verify-kit 的每个包', () => {
  assert.ok(existsSync(SIBLING_HINT), `缺 ${SIBLING_HINT}；suite 的成员从这个目录来`)
  const m = members()
  const names = new Set(m.map((x) => x.name))
  assert.equal(names.size, m.length, '成员里有重名')
  // 不写死数字：期望值从 checks-data（本仓有哪些检查）与隔壁目录（verify-kit 有哪些包）
  // 推出来。写死 27 的那一版在新加三个检查后立刻红了——数字本身不是判据。
  const expected = CHECKS.length + verifyKitCount()
  assert.equal(m.length, expected, `期望 ${expected} 个成员（${CHECKS.length} 检查 + ${verifyKitCount()} 个 verify-kit 包），实际 ${m.length}`)
  for (const check of CHECKS) {
    assert.ok(names.has(check.npm), `CHECKS 里的 ${check.npm} 不在 suite 成员里`)
  }
})

test('patch 与 workspace 不漂移（package.json 的依赖与行都由脚本生成）', () => {
  const d = drift()
  assert.deepEqual(d.map((f) => f.file), [], '漂移；跑 node scripts/sync-suite.mjs')
})

test('每个成员在 patch 里恰好一行，且都是声明的依赖', () => {
  const m = members()
  const patch = readFileSync(resolve(SUITE, 'cordis.patch.yml'), 'utf8')
  const names = [...patch.matchAll(/name:\s*'([^']+)'/g)].map((x) => x[1])
  assert.deepEqual(names.slice().sort(), m.map((x) => x.name).sort())
  const deps = JSON.parse(readFileSync(resolve(SUITE, 'package.json'), 'utf8')).dependencies
  for (const n of names) assert.ok(deps[n], `${n} 在 patch 里但不是依赖——Loader 解析不到`)
})

test('依赖版本与 workspace 一致：不写死，防止版本漂移', () => {
  const m = members()
  const deps = JSON.parse(readFileSync(resolve(SUITE, 'package.json'), 'utf8')).dependencies
  assert.deepEqual(deps, depsOf(m))
  for (const x of m) assert.equal(deps[x.name], `^${x.version}`, `${x.name} 版本与 workspace 不一致`)
})

test('行 id 唯一，且不与任何成员自己 patch 的 id 撞车', () => {
  const m = members()
  const ids = m.map((x) => rowId(x.name))
  assert.equal(new Set(ids).size, ids.length, 'suite 内部行 id 重复')
  const own = new Set(m.map((x) => x.ownId).filter(Boolean))
  for (const id of ids) {
    assert.ok(!own.has(id), `行 id ${id} 与某个包自己的 patch id 相同——同时安装会被 Loader 判重复`)
  }
})

test('locale 两种语言都在、都是真翻译', () => {
  const en = JSON.parse(readFileSync(resolve(SUITE, 'locale/en.json'), 'utf8')).meta
  const zh = JSON.parse(readFileSync(resolve(SUITE, 'locale/zh.json'), 'utf8')).meta
  for (const [lang, m] of Object.entries({ en, zh })) {
    assert.ok(m.title?.trim(), `${lang}: title 为空`)
    assert.ok(m.description?.trim(), `${lang}: description 为空`)
    assert.equal(m.detail, 'docs/DETAIL.md', `${lang}: detail 没指向 DETAIL.md`)
  }
  assert.notEqual(en.title, zh.title)
  assert.ok(cjkRatio(en.description) < 0.1, 'en 描述主体不是英文')
  assert.ok(cjkRatio(zh.description) > 0.3, 'zh 描述主体不是中文')
})

test('图标存在、是 SVG、在 256 KiB 以内', () => {
  const p = resolve(SUITE, 'icon.svg')
  assert.ok(existsSync(p), '缺 icon.svg')
  assert.ok(statSync(p).size <= 256 * 1024, 'icon 超过 256 KiB')
  assert.match(readFileSync(p, 'utf8'), /^<svg[\s>]/, 'icon.svg 不是 SVG')
})

test('发布产物里真的有 patch、locale、DETAIL、icon（不是只在磁盘上）', () => {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: SUITE,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  const files = JSON.parse(out)[0].files.map((f) => f.path)
  for (const need of [
    'cordis.patch.yml',
    'locale/en.json',
    'locale/zh.json',
    'docs/DETAIL.md',
    'icon.svg',
    'README.md',
    'LICENSE',
  ]) {
    assert.ok(files.includes(need), `发布产物缺 ${need}；实际：${files.join(', ')}`)
  }
  assert.ok(!files.some((f) => f.startsWith('test/')), '测试文件不该进发布产物')
})

test('DETAIL.md 在 1 MiB 以内（pluginManager.detailMaxBytes 默认值）', () => {
  assert.ok(statSync(resolve(SUITE, 'docs/DETAIL.md')).size <= 1024 * 1024)
})