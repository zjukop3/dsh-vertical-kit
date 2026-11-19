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