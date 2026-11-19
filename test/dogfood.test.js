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
import { lintLicense } from '../packages/dsh-license-check/src/index.js'
import { lintCommitMessage } from '../packages/dsh-commit-msg-check/src/index.js'
import { lintAdr } from '../packages/dsh-adr-check/src/index.js'
import { lintIncidentReport } from '../packages/dsh-incident-report-check/src/index.js'
import { lintOpsRunbook } from '../packages/dsh-ops-runbook-check/src/index.js'
import { lintReleaseNotes, maskCollapsedHistory } from '../packages/dsh-release-notes-check/src/index.js'
import { lintApiDoc } from '../packages/dsh-api-doc-check/src/index.js'
import { lintDockerfile } from '../packages/dsh-dockerfile-check/src/index.js'
import { lintEnvExample } from '../packages/dsh-env-example-check/src/index.js'
import { lintHandover } from '../packages/dsh-handover-check/src/index.js'

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

test('the API reference this project ships passes api-doc-check', async () => {
  // Until this document existed, api-doc-check had nothing of ours to run on:
  // the plugin exposes twelve host routes and documented none of them as an
  // interface. Writing it found six errors in the draft, four of them shapes a
  // front-end would read first.
  const path = join(parent, 'dsh-review-outbox', 'docs', 'API.md')
  assert.ok(await exists(path), 'the API reference is part of the corpus')
  const result = lintApiDoc(await readFile(path, 'utf8'))
  assert.deepEqual(result.findings, [], JSON.stringify(result.findings))
  assert.ok(result.checked.endpoints >= 12, `expected every route documented, saw ${result.checked.endpoints}`)
})

// Files this project did not write. The catalog research pulls plugin
// repositories into dsh-ecosystem-research/sources, and Dockerfiles and
// .env.example files from there are the only third-party corpus available.
// Real files from strangers are what the checks are actually for: the first run
// over them found a root-user Dockerfile and one false positive worth fixing.
async function thirdParty(patterns) {
  const base = join(parent, 'dsh-ecosystem-research', 'sources', 'plugins')
  if (!(await exists(base))) return []
  const out = []
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (patterns.some(pattern => pattern.test(entry.name))) out.push({ path: full, text: await readFile(full, 'utf8') })
    }
  }
  await walk(base)
  return out
}

test('third-party Dockerfiles and env examples are read without crashing the checks', async () => {
  // Not "must be clean": these are other people's files and a real defect in one
  // of them is a finding, not a failure. What is asserted is that every file
  // parses and the rules that do fire name something concrete.
  const dockerfiles = await thirdParty([/^Dockerfile.*$/])
  const envExamples = await thirdParty([/^\.env\..*$/, /.*\.env\.example$/])
  assert.ok(dockerfiles.length + envExamples.length >= 2, `expected third-party corpus, found ${dockerfiles.length} Dockerfiles and ${envExamples.length} env examples`)

  for (const { path, text } of dockerfiles) {
    const result = lintDockerfile(text)
    for (const finding of result.findings) {
      assert.ok(finding.rule && finding.message, `${path}: a finding must name a rule and a message`)
    }
  }
  for (const { path, text } of envExamples) {
    const result = lintEnvExample(text)
    for (const finding of result.findings) {
      assert.ok(finding.rule && finding.message, `${path}: a finding must name a rule and a message`)
    }
    // A documentation URL on a reserved example domain must never be reported as
    // a committed literal — that was a real false positive on this corpus.
    assert.ok(!result.findings.some(f => f.rule === 'literal-value' && /example\.(?:com|org|net|edu)/.test(f.message)),
      `${path}: an example domain is a placeholder`)
  }
})

test('third-party READMEs are read, and the two false positives stay fixed', async () => {
  // Not "must pass": these are other people's READMEs written for their own
  // purpose, and a gap in one is an observation about the ecosystem, not a
  // failure. Two things are asserted — that the checker survives them, and that
  // the specific false positives found on this corpus do not come back.
  const readmePaths = []
  const base = join(parent, 'dsh-ecosystem-research', 'sources', 'plugins')
  if (await exists(base)) {
    for (const repo of await readdir(base, { withFileTypes: true })) {
      if (!repo.isDirectory()) continue
      for (const name of await readdir(join(base, repo.name))) {
        if (/^readme.*\.md$/i.test(name)) readmePaths.push(join(base, repo.name, name))
      }
    }
  }
  assert.ok(readmePaths.length >= 20, `expected the third-party README corpus, found ${readmePaths.length}`)

  const results = []
  for (const path of readmePaths) {
    const text = await readFile(path, 'utf8')
    results.push({ path, text, result: lintOnboarding(text) })
  }
  for (const { path, result } of results) {
    assert.equal(typeof result.errors, 'number', path)
    for (const finding of result.findings) assert.ok(finding.rule && finding.message, path)
  }

  // 1. `dsh plugin add …` is a command. Every README that shows it inside a
  //    fence must not be told it has no command — the check did not know the
  //    platform's own install command, which 216 files in this ecosystem use.
  const withPlatformInstall = results.filter(entry => /```[\s\S]*?dsh plugin[\s\S]*?```/.test(entry.text))
  assert.ok(withPlatformInstall.length > 0, 'the corpus must contain the platform install command')
  for (const entry of withPlatformInstall) {
    assert.ok(!entry.result.findings.some(f => f.rule === 'command-missing'),
      `${entry.path}: dsh plugin … is a command`)
  }

  // 2. A success cue written as a shell comment inside an install block counts.
  const todo = results.find(entry => entry.path.includes('dsh-todo-inbox'))
  if (todo) {
    assert.ok(!todo.result.findings.some(f => f.rule === 'success-missing'),
      'dsh-todo-inbox states its success cue in a shell comment and must not be told it is missing')
  }
})

test('third-party LICENSE files are read, and the copyright rules stay precise', async () => {
  // 21 LICENSE files from other plugin repositories. Not "must pass": two of them
  // are genuinely broken (one body is not a recognised license, one is titled MIT
  // with AGPL-3.0 text) and that is a finding, not a failure. What is asserted is
  // that the false positives found on this corpus do not come back.
  const base = join(parent, 'dsh-ecosystem-research', 'sources', 'plugins')
  const paths = []
  if (await exists(base)) {
    for (const repo of await readdir(base, { withFileTypes: true })) {
      if (!repo.isDirectory()) continue
      for (const name of await readdir(join(base, repo.name))) {
        if (/^LICEN[CS]E/i.test(name)) paths.push(join(base, repo.name, name))
      }
    }
  }
  assert.ok(paths.length >= 15, `expected the third-party LICENSE corpus, found ${paths.length}`)

  const results = []
  for (const path of paths) results.push({ path, text: await readFile(path, 'utf8'), result: lintLicense(await readFile(path, 'utf8')) })

  // 1. Apache-2.0 defines "Licensor" as "the copyright owner" — that line is not
  //    a notice, and using it reported four correct files as missing both a year
  //    and a holder.
  for (const entry of results.filter(e => /Apache License/.test(e.text))) {
    assert.ok(!entry.result.findings.some(f => f.rule === 'copyright-year-missing'),
      `${entry.path}: the definitions line is not a copyright notice`)
  }

  // 2. An unfilled appendix slot in a license that ships one is advice, not an error.
  for (const entry of results) {
    if (!/Apache License/.test(entry.text)) continue
    for (const finding of entry.result.findings) {
      assert.notEqual(finding.rule, 'placeholder-left',
        `${entry.path}: an Apache appendix slot must be a warning, not an error`)
    }
  }

  // 3. A real defect is still reported: title says one thing, body says another.
  const mismatched = results.find(entry => entry.path.includes('dsh-guizang-design'))
  if (mismatched) {
    assert.ok(mismatched.result.findings.some(f => f.rule === 'title-body-mismatch'),
      'a LICENSE titled MIT with AGPL-3.0 text must still be reported')
  }
})

test('third-party CHANGELOGs are read, and a collapsed appendix is not a sequence', async () => {
  // 11 Markdown changelogs from other plugin repositories. Not "must pass": one
  // of them really does list an unreleased alpha after a newer stable release,
  // outside the <details> block its own Chinese translation wraps it in. That is
  // a finding about their file, not a defect here.
  const base = join(parent, 'dsh-ecosystem-research', 'sources', 'plugins')
  const paths = []
  if (await exists(base)) {
    for (const repo of await readdir(base, { withFileTypes: true })) {
      if (!repo.isDirectory()) continue
      for (const name of await readdir(join(base, repo.name))) {
        if (/^CHANGELOG.*\.md$/i.test(name)) paths.push(join(base, repo.name, name))
      }
    }
  }
  assert.ok(paths.length >= 8, `expected the third-party CHANGELOG corpus, found ${paths.length}`)

  const results = []
  for (const path of paths) {
    const text = await readFile(path, 'utf8')
    results.push({ path, text, result: lintReleaseNotes(text) })
  }
  for (const { path, result } of results) {
    for (const finding of result.findings) assert.ok(finding.rule && finding.message, path)
  }

  // A collapsed history appendix must not produce an ordering finding: entries
  // re-listed there are not claiming to be in sequence.
  for (const entry of results.filter(e => /<details>[\s\S]*?<\/details>/i.test(e.text))) {
    const outside = maskCollapsedHistory(entry.text)
    for (const finding of entry.result.findings.filter(f => f.rule === 'order')) {
      const line = outside.split('\n')[finding.line - 1] ?? ''
      assert.ok(line.trim() !== '', `${entry.path}:${finding.line}: an order finding landed inside a collapsed appendix`)
    }
  }
})

test('this project own handover states its one honest gap and nothing else', async () => {
  // docs/HANDOVER.md is written for the moment its author is gone. It is allowed
  // exactly one error: nobody has taken over. Any second error is a defect in the
  // document or in the check.
  const path = join(parent, 'dsh-review-outbox', 'docs', 'HANDOVER.md')
  assert.ok(await exists(path), 'the project ships a handover document')
  const result = lintHandover(await readFile(path, 'utf8'))
  const errors = result.findings.filter(f => f.level === 'error')
  assert.deepEqual(errors.map(f => f.rule), ['receiver-unassigned'],
    `the only acceptable error is an unassigned receiver, got ${JSON.stringify(errors.map(f => f.rule))}`)
  assert.ok(result.checked.items >= 5, 'the handover lists its work items')
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