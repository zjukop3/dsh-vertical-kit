import test from 'node:test'
import assert from 'node:assert/strict'
import { lintCommitMessage, parseCommit, TYPES } from '../src/index.js'

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

test('a bare sentence is type-missing', () => {
  const result = lintCommitMessage('修了几个 bug\n')
  assert.ok(result.findings.some(finding => finding.rule === 'type-missing'))
  assert.equal(result.ok, false)
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
