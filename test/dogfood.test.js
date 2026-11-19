// The dogfood gate: run each check against the artifacts this repository
// actually ships, and require it to leave them alone.
//
// Four rules in this kit shipped broken and every unit test passed, because a
// unit test only knows the fixtures its author thought of. What found them was
// pointing the checker at real work:
//
//   onboarding    20 of 23 real READMEs reported success-missing
//   release-notes all 3 real CHANGELOGs reported version-missing
//   commit-msg    61% of 102 real commits reported type-missing
//   pr-description 19 of 19 real merged PRs reported all three of what/why/test
//
// So the corpus is checked in as a test rather than left as a manual exercise.
// A rule that starts flagging documents this project itself writes will fail
// here first.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

import { lintOnboarding } from '../packages/dsh-onboarding-check/src/index.js'
import { lintReleaseNotes } from '../packages/dsh-release-notes-check/src/index.js'
import { lintLicense } from '../packages/dsh-license-check/src/index.js'
import { lintCommitMessage } from '../packages/dsh-commit-msg-check/src/index.js'
import { lintAdr } from '../packages/dsh-adr-check/src/index.js'
import { lintIncidentReport } from '../packages/dsh-incident-report-check/src/index.js'
import { lintOpsRunbook } from '../packages/dsh-ops-runbook-check/src/index.js'

const root = resolve(import.meta.dirname, '..')
const parent = resolve(root, '..')
const exists = async path => stat(path).then(() => true, () => false)

// Every README this project ships: the kit, the two sibling repositories, and
// all twenty package pages that go to npm.
async function readmes() {
  const out = [join(root, 'README.md'), join(parent, 'dsh-verify-kit', 'README.md'), join(parent, 'dsh-review-outbox', 'README.md')]
  const packages = (await readdir(join(root, 'packages'))).filter(name => name.startsWith('dsh-')).sort()
  for (const pkg of packages) out.push(join(root, 'packages', pkg, 'README.md'))
  return (await Promise.all(out.map(async path => ((await exists(path)) ? { path, text: await readFile(path, 'utf8') } : null)))).filter(Boolean)
}

async function changelogs() {
  const candidates = [join(root, 'CHANGELOG.md'), join(parent, 'dsh-verify-kit', 'CHANGELOG.md'), join(parent, 'dsh-review-outbox', 'CHANGELOG.md')]
  return (await Promise.all(candidates.map(async path => ((await exists(path)) ? { path, text: await readFile(path, 'utf8') } : null)))).filter(Boolean)
}

// The decision log and the incident log: documents this project writes for
// itself, and the corpus that keeps adr-check and incident-report-check honest.
async function docsIn(subdir, extension = '.md') {
  const dir = join(parent, 'dsh-review-outbox', 'docs', subdir)
  if (!(await exists(dir))) return []
  const names = (await readdir(dir)).filter(name => name.endsWith(extension)).sort()
  return Promise.all(names.map(async name => ({ path: join(dir, name), text: await readFile(join(dir, name), 'utf8') })))
}

async function licenses() {
  const paths = []
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'site') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (/^LICEN[CS]E(\..*)?$/i.test(entry.name)) paths.push(full)
    }
  }
  await walk(root)
  return Promise.all(paths.map(async path => ({ path, text: await readFile(path, 'utf8') })))
}

test('the dogfood corpus is not empty, so the assertions below cannot pass vacuously', async () => {
  const [readmeList, changelogList, licenseList] = await Promise.all([readmes(), changelogs(), licenses()])
  assert.ok(readmeList.length >= 20, `expected the twenty package READMEs, found ${readmeList.length}`)
  assert.ok(changelogList.length >= 3, `expected three changelogs, found ${changelogList.length}`)
  assert.ok(licenseList.length >= 20, `expected a LICENSE per package, found ${licenseList.length}`)
})

test('every README this project ships passes onboarding-check with nothing at all', async () => {
  const failures = []
  for (const { path, text } of await readmes()) {
    const result = lintOnboarding(text)
    const named = result.findings.filter(finding => finding.level === 'error' || finding.level === 'warn')
    if (named.length > 0) failures.push(`${path.replace(root, '.')}: ${named.map(f => `${f.level} ${f.rule}`).join(', ')}`)
  }
  assert.deepEqual(failures, [], 'a README this project wrote is not an onboarding document that passes its own check')
})

test('every CHANGELOG this project ships passes release-notes-check', async () => {
  const failures = []
  for (const { path, text } of await changelogs()) {
    const result = lintReleaseNotes(text)
    const errors = result.findings.filter(finding => finding.level === 'error')
    if (errors.length > 0) failures.push(`${path.replace(root, '.')}: ${errors.map(f => f.rule).join(', ')}`)
  }
  assert.deepEqual(failures, [])
})

test('every LICENSE this project ships passes license-check', async () => {
  const failures = []
  for (const { path, text } of await licenses()) {
    const result = lintLicense(text)
    const errors = result.findings.filter(finding => finding.level === 'error')
    if (errors.length > 0) failures.push(`${path.replace(root, '.')}: ${errors.map(f => f.message).join(' | ')}`)
  }
  assert.deepEqual(failures, [])
})

test('every ADR this project wrote passes adr-check', async () => {
  const docs = await docsIn('adr')
  assert.ok(docs.length >= 3, `expected the decision log, found ${docs.length} file(s)`)
  const failures = []
  for (const { path, text } of docs) {
    const result = lintAdr(text)
    if (result.findings.length > 0) failures.push(`${path.split('/').pop()}: ${result.findings.map(f => `${f.level} ${f.rule}`).join(', ')}`)
  }
  assert.deepEqual(failures, [])
})

test('every incident postmortem this project wrote passes incident-report-check', async () => {
  const docs = await docsIn('incidents')
  assert.ok(docs.length >= 1, `expected the incident log, found ${docs.length} file(s)`)
  const failures = []
  for (const { path, text } of docs) {
    const result = lintIncidentReport(text)
    if (result.findings.length > 0) failures.push(`${path.split('/').pop()}: ${result.findings.map(f => `${f.level} ${f.rule}`).join(', ')}`)
  }
  assert.deepEqual(failures, [])
})

test('every runbook this project ships passes ops-runbook-check', async () => {
  // The four documents a person follows under pressure. Prerequisites, numbered
  // steps, rollback and verification were missing from all four until this test
  // existed; two of them order their steps as `## 3. …` headings, which the
  // check did not recognise as steps at all.
  const names = ['OPERATIONS.md', 'INSTALL-RECOVERY.md', 'MONTHLY-RUNBOOK.md', 'RELEASE-RUNBOOK.md']
  const dir = join(parent, 'dsh-review-outbox', 'docs')
  const docs = []
  for (const name of names) {
    const path = join(dir, name)
    if (await exists(path)) docs.push({ path, text: await readFile(path, 'utf8') })
  }
  assert.equal(docs.length, names.length, `expected ${names.length} runbooks, found ${docs.length}`)
  const failures = []
  for (const { path, text } of docs) {
    const result = lintOpsRunbook(text)
    if (result.findings.length > 0) failures.push(`${path.split('/').pop()}: ${result.findings.map(f => `${f.level} ${f.rule}`).join(', ')}`)
  }
  assert.deepEqual(failures, [])
})

test('no real commit in this project is blocked for its type prefix', async () => {
  // The history is written in `Verb noun` style plus Chinese, not Conventional
  // Commits. That is a house style, so it must never be an error here: the
  // subject-length rule is the one allowed to fire on real history, because
  // those subjects really do wrap in git log.
  const repos = ['dsh-vertical-kit', 'dsh-review-outbox', 'dsh-verify-kit'].map(name => join(parent, name))
  const offenders = []
  let examined = 0
  for (const repo of repos) {
    if (!(await exists(join(repo, '.git')))) continue
    const log = execFileSync('git', ['-C', repo, 'log', '-n', '40', '--format=%H'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    for (const sha of log.split('\n').filter(Boolean)) {
      const message = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%B', sha], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      examined += 1
      const result = lintCommitMessage(message)
      for (const finding of result.findings) {
        if (finding.level !== 'error') continue
        if (finding.rule === 'subject-long') continue
        offenders.push(`${repo.split('/').pop()} ${sha.slice(0, 7)} ${finding.rule}`)
      }
    }
  }
  assert.ok(examined >= 90, `expected to examine real history, saw ${examined} commit(s)`)
  assert.deepEqual(offenders, [], 'a house-style rule is blocking real commits')
})