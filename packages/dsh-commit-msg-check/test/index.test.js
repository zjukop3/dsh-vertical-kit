import test from 'node:test'
import assert from 'node:assert/strict'
import { lintCommitMessage, parseCommit, typePolicy, TYPES } from '../src/index.js'

const good = `feat(api): add pagination to the items endpoint

The list endpoint returned every row; it now takes page and size.

BREAKING CHANGE: the response shape moved items under a data key.
`

test('a well-formed commit passes', () => {
  const result = lintCommitMessage(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.type, 'feat')
  assert.equal(result.checked.scope, 'api')
})

test('parseCommit splits header, scope and subject', () => {
  const parsed = parseCommit('fix(parser): handle empty input')
  assert.equal(parsed.type, 'fix')
  assert.equal(parsed.scope, 'parser')
  assert.equal(parsed.subject, 'handle empty input')
  assert.equal(parsed.bang, false)
})

test('parseCommit reads the bang', () => {
  const parsed = parseCommit('feat!: drop node 18')
  assert.equal(parsed.bang, true)
  assert.equal(parsed.type, 'feat')
})

test('a bare sentence is type-missing, and that is a warning by default', () => {
  // The type prefix is Conventional Commits, a house style. Erroring on it by
  // default would block every commit of a repo that never adopted it, which is
  // how a check gets uninstalled on day one. The four shape rules below stay
  // errors because they are wrong in every repo, in every language.
  const result = lintCommitMessage('修了几个 bug\n')
  const finding = result.findings.find(f => f.rule === 'type-missing')
  assert.equal(finding.level, 'warn')
  assert.equal(result.ok, true)
  assert.equal(result.errors, 0)
})

test('requireType: "error" makes the type prefix blocking', () => {
  const result = lintCommitMessage('修了几个 bug\n', { requireType: 'error' })
  const finding = result.findings.find(f => f.rule === 'type-missing')
  assert.equal(finding.level, 'error')
  assert.equal(result.ok, false)
})

test('the 0.1.0 booleans still mean what they meant', () => {
  assert.equal(typePolicy({ requireType: true }), 'error')
  assert.equal(typePolicy({ requireType: false }), 'off')
  assert.equal(lintCommitMessage('修了几个 bug\n', { requireType: true }).ok, false)
  assert.ok(!lintCommitMessage('修了几个 bug\n', { requireType: false }).findings.some(f => f.rule === 'type-missing'))
})

test('requireType: "off" drops the finding entirely', () => {
  const result = lintCommitMessage('修了几个 bug\n', { requireType: 'off' })
  assert.ok(!result.findings.some(f => f.rule === 'type-missing'))
  assert.equal(result.ok, true)
})

test('an unrecognised requireType falls back to warn rather than off', () => {
  // Silently disabling a check because someone typo'd the option is the one
  // failure mode worth avoiding: "wran" must not mean "no type check".
  assert.equal(typePolicy({ requireType: 'wran' }), 'warn')
  assert.equal(typePolicy({}), 'warn')
  assert.equal(lintCommitMessage('修了几个 bug\n', { requireType: 'wran' }).warnings, 1)
})

test('a repo that never adopted Conventional Commits is not error-blocked', () => {
  // This is the dogfood result: 102 real commits from three repos written in
  // `Verb noun` style and Chinese, 61 of them with no type prefix. Under a
  // default error that repo cannot commit at all. The layer that stays is the
  // one that is actually wrong: 58 subjects over 72 characters.
  const header = 'Record: 这条提交信息根本没超过七十二个字符所以只该报警告，别把风格当错误'
  const flat = lintCommitMessage(`${header}\n`)
  assert.equal(flat.errors, 0, 'a convention miss must not block the commit')
  assert.equal(flat.ok, true)
})

test('an unknown type is a warn, not an error', () => {
  const result = lintCommitMessage('wip: something\n')
  assert.equal(result.ok, true)
  assert.ok(result.findings.some(finding => finding.rule === 'type-unknown' && finding.level === 'warn'))
})

test('a subject over the limit is an error and the limit is configurable', () => {
  const long = `feat: ${'x'.repeat(80)}\n`
  assert.ok(lintCommitMessage(long).findings.some(finding => finding.rule === 'subject-long'))
  assert.ok(!lintCommitMessage(long, { maxSubject: 120 }).findings.some(finding => finding.rule === 'subject-long'))
})

test('a trailing period is a warn', () => {
  const result = lintCommitMessage('fix: correct the offset.\n')
  assert.ok(result.findings.some(finding => finding.rule === 'subject-period'))
})

test('a missing blank line after the header is an error', () => {
  const result = lintCommitMessage('feat: add x\nbody starts immediately\n')
  assert.ok(result.findings.some(finding => finding.rule === 'body-separator'))
})

test('a bang without a BREAKING CHANGE trailer is a warn', () => {
  const result = lintCommitMessage('feat!: drop old api\n\nsome body\n')
  assert.ok(result.findings.some(finding => finding.rule === 'breaking-untrailed'))
})

test('an empty message is a single empty error', () => {
  const result = lintCommitMessage('\n')
  assert.equal(result.ok, false)
  assert.equal(result.findings[0].rule, 'empty')
})

test('every type in the set is accepted', () => {
  for (const type of TYPES) {
    const result = lintCommitMessage(`${type}: do a thing\n`)
    assert.ok(!result.findings.some(finding => finding.rule === 'type-missing' || finding.rule === 'type-unknown'), type)
  }
})
