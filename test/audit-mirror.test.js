import test from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, classify } from '../scripts/audit-mirror.mjs'

// 镜像对账的两条纯判据。
//
// 2026-11-23 的真实故障：在一个干净 profile 里 `dsh plugin add dsh-check-suite`，
// pnpm 报 ERR_PNPM_TARBALL_EXTRACT，指向
// registry.npmmirror.com/…/dsh-check-suite-0.0.0-stage.tgz。npmjs 上 latest 是 0.1.0。
// 镜像的 dist-tags.latest 一直停在名字首发时那个占位包里，读者拿到的是空壳。
//
// 判据必须落在「读者装上的是不是我要他装的那个版本」这个属性上，所以：
// 1) 版本比较按 semver 顺序，不按字典序；
// 2) 「镜像只剩预发布」要单独成一种状态，不能笼统算成「落后」——落后可以说「等一会
//    儿镜像会跟上」，而这种状态不会自己好。

test('版本比较按 semver 顺序，不按字典序', () => {
  assert.equal(compareVersions('0.1.10', '0.1.9'), 1) // 字典序会给出 -1
  assert.equal(compareVersions('0.2.0', '0.10.0'), -1) // 字典序会给出 1
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('0.1.5', '0.1.5'), 0)
})

test('同号预发布低于正式版', () => {
  assert.equal(compareVersions('0.0.0-stage', '0.0.0'), -1)
  assert.equal(compareVersions('0.0.0', '0.0.0-stage'), 1)
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-beta'), -1)
  assert.equal(compareVersions('0.1.0-rc.1', '0.1.0'), -1)
})

test('两字符串相等但顺序比较仍要成立（防手写特例）', () => {
  for (const v of ['0.0.0-stage', '0.1.0', '0.1.10', '2.3.4-rc.2']) {
    assert.equal(compareVersions(v, v), 0, v)
  }
})

test('对齐判定：latest 相同即 ok', () => {
  assert.equal(classify({ upstreamLatest: '0.1.0', mirrorLatest: '0.1.0', mirrorVersions: ['0.0.0-stage', '0.1.0'] }), 'ok')
})

test('镜像只剩预发布占位包 → stale-stage（那次真实故障的形态）', () => {
  // 逐字来自 2026-11-23 的镜像响应：dist-tags.latest = 0.0.0-stage，versions 只有它
  assert.equal(classify({ upstreamLatest: '0.1.0', mirrorLatest: '0.0.0-stage', mirrorVersions: ['0.0.0-stage'] }), 'stale-stage')
})

test('镜像落后但有正式版 → behind（会自己跟上，与 stale-stage 区分）', () => {
  assert.equal(
    classify({ upstreamLatest: '0.1.4', mirrorLatest: '0.1.3', mirrorVersions: ['0.1.0', '0.1.1', '0.1.2', '0.1.3'] }),
    'behind',
  )
})

test('镜像没记录 → missing；镜像超前 → forked（都要人看一眼）', () => {
  assert.equal(classify({ upstreamLatest: '0.1.0', mirrorLatest: null, mirrorVersions: [] }), 'missing')
  assert.equal(classify({ upstreamLatest: '0.1.0', mirrorLatest: '0.2.0', mirrorVersions: ['0.1.0', '0.2.0'] }), 'forked')
})

test('镜像认识旧版预发布但 latest 已是正式版 → ok，不能误报', () => {
  assert.equal(
    classify({ upstreamLatest: '0.1.0', mirrorLatest: '0.1.0', mirrorVersions: ['0.0.0-stage', '0.1.0'] }),
    'ok',
  )
})