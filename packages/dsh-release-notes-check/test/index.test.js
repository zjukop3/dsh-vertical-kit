import test from 'node:test'
import assert from 'node:assert/strict'
import { lintReleaseNotes, versionHeadings } from '../src/index.js'

const good = `# Changelog

## 2.1.0 — 2026-11-17

### 新增

- 支持导出 CSV

### Breaking

- 配置文件键「endpoint」改名「server」

### 升级

把「endpoint」改成「server」，其余不动。

## 2.0.0 — 2026-10-01

- 初版重构
`

const bad = `# 更新说明

今天发了新版本，改了一些东西。

## 1.9.0

- 修了几个问题

## 2.0.0

- 破坏性变更：配置格式重写
`

test('a complete changelog passes', () => {
  const result = lintReleaseNotes(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.versions, 2)
})

test('every defect class is reported', () => {
  const result = lintReleaseNotes(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => `${finding.rule}:${finding.line}`)
  assert.ok(rules.includes('date-missing:0'))
  assert.ok(rules.includes('upgrade-missing:0'))
  assert.ok(rules.includes('order:8'))
  assert.ok(rules.includes('breaking-without-upgrade:0'))
})

test('reverse-chronological order is the convention, enforced by heading order', () => {
  const headings = versionHeadings(good)
  assert.deepEqual(headings.map(heading => heading.text), ['2.1.0', '2.0.0'])
  const result = lintReleaseNotes(bad)
  const order = result.findings.find(finding => finding.rule === 'order')
  assert.match(order.message, /新版本在前/)
})

test('breaking without upgrade is an error, with upgrade it is fine', () => {
  const withUpgrade = '# c\n\n## 2.0.0 — 2026-11-17\n\n### Breaking\n\n- 配置重写\n\n### 升级\n\n见迁移文档。\n'
  assert.deepEqual(lintReleaseNotes(withUpgrade).findings, [])
  const without = '# c\n\n## 2.0.0 — 2026-11-17\n\n### Breaking\n\n- 配置重写\n'
  const result = lintReleaseNotes(without)
  assert.ok(result.findings.some(finding => finding.rule === 'breaking-without-upgrade'))
})

test('upgrade requirement is configurable away', () => {
  const text = '# c\n\n## 1.0.0 — 2026-11-17\n\n- 初版\n'
  const strict = lintReleaseNotes(text)
  assert.ok(strict.findings.some(finding => finding.rule === 'upgrade-missing'))
  const relaxed = lintReleaseNotes(text, { requireUpgrade: false })
  assert.ok(!relaxed.findings.some(finding => finding.rule === 'upgrade-missing'))
  assert.equal(relaxed.ok, true)
})

test('a version heading is not required to carry the date; either counts', () => {
  const text = '# c\n\n版本：1.0.0\n发布日期：2026-11-17\n\n- 初版\n'
  const result = lintReleaseNotes(text)
  assert.ok(!result.findings.some(finding => finding.rule === 'version-missing'))
  assert.ok(!result.findings.some(finding => finding.rule === 'date-missing'))
})

test('the Keep a Changelog bracketed heading is a version heading', () => {
  // `## [1.2.0] - 2026-11-17` is what Keep a Changelog prescribes. Rejecting it
  // was the check measuring its own preferred spelling: all three of this
  // project's own changelogs used it and all three were reported version-missing.
  for (const heading of ['## 1.2.0', '## v1.2.0', '## [1.2.0]', '## [1.2.0] - 2026-11-17', '### [v1.2.0] - 2026-11-17']) {
    const doc = `${heading}\n\n- nothing broke\n`
    const result = lintReleaseNotes(doc, { requireUpgrade: false })
    assert.ok(!result.findings.some(f => f.rule === 'version-missing'), heading)
  }
})

test('ordering still reads bracketed headings, newest first', () => {
  const doc = `# Changelog

## [1.2.0] - 2026-11-17

- new

## [1.1.0] - 2026-10-01

- old
`
  const rows = versionHeadings(doc)
  assert.deepEqual(rows.map(r => `${r.major}.${r.minor}`), ['1.2', '1.1'])
  const result = lintReleaseNotes(doc, { requireUpgrade: false })
  assert.ok(!result.findings.some(f => f.rule === 'order'), JSON.stringify(result.findings))
})

test('a bracketed changelog that runs oldest-first is still wrong', () => {
  const doc = `# Changelog

## [1.1.0] - 2026-10-01

- old

## [1.2.0] - 2026-11-17

- new
`
  const result = lintReleaseNotes(doc, { requireUpgrade: false })
  assert.ok(result.findings.some(f => f.rule === 'order'), JSON.stringify(result.findings))
})
