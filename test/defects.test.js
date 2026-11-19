// The defect ledger's claims must be executable, or the page built from it is
// just another feature list with a humble tone.
//
// For a false positive, the claim is "this input no longer produces that rule".
// For a dead rule, the claim is "this input now produces it".
// For the line-number defect, the claim is where the finding lands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFECTS, LEDGER } from '../scripts/defects.mjs'
import { lintCommitMessage } from '../packages/dsh-commit-msg-check/src/index.js'
import { lintOnboarding } from '../packages/dsh-onboarding-check/src/index.js'
import { lintReleaseNotes } from '../packages/dsh-release-notes-check/src/index.js'
import { lintPrDescription } from '../packages/dsh-pr-description-check/src/index.js'
import { lintAdr } from '../packages/dsh-adr-check/src/index.js'
import { lintOpsRunbook } from '../packages/dsh-ops-runbook-check/src/index.js'
import { lintListings } from '../packages/dsh-listing-check/src/index.js'
import { lintEnvExample } from '../packages/dsh-env-example-check/src/index.js'
import { lintOutline } from '../../dsh-verify-kit/packages/dsh-outline-lint/src/index.js'
import { lintLicense } from '../packages/dsh-license-check/src/index.js'

const LINTERS = {
  'commit-msg-check': lintCommitMessage,
  'onboarding-check': lintOnboarding,
  'release-notes-check': lintReleaseNotes,
  'pr-description-check': lintPrDescription,
  'adr-check': lintAdr,
  'ops-runbook-check': lintOpsRunbook,
  'listing-check': lintListings,
  'env-example-check': lintEnvExample,
  'outline-lint': lintOutline,
  'license-check': lintLicense,
}

const ruleOf = name => name.split(' / ')[0]

test('the ledger is well formed and every entry names a linter this test can run', () => {
  assert.equal(LEDGER.total, 17)
  for (const defect of DEFECTS) {
    assert.ok(defect.n > 0, 'a defect has a number')
    assert.ok(defect.check, `${defect.n}: names a check`)
    assert.ok(defect.rule, `${defect.n}: names a rule`)
    assert.ok(defect.wrong && defect.right && defect.lesson, `${defect.n}: says what it was, what it is, and why`)
    assert.ok(defect.fixedIn, `${defect.n}: names the version that fixed it`)
    assert.ok(defect.foundBy, `${defect.n}: names how it was found`)
    assert.ok(LINTERS[defect.check], `${defect.n}: ${defect.check} has a linter here`)
    assert.ok(['silent', 'fires', 'line'].includes(defect.now.kind), `${defect.n}: known assertion kind`)
  }
})

test('every false positive stays fixed: the reproducer no longer yields that rule', () => {
  const falsePositives = DEFECTS.filter(defect => defect.now.kind === 'silent')
  assert.ok(falsePositives.length >= 10, `expected most entries to be false positives, found ${falsePositives.length}`)
  for (const defect of falsePositives) {
    const result = LINTERS[defect.check](defect.now.input)
    const fired = result.findings.filter(finding => ruleOf(finding.rule) === ruleOf(defect.now.rule) || finding.rule === defect.now.rule)
    assert.deepEqual(fired, [], `${defect.n} ${defect.check} ${defect.now.rule}: ${JSON.stringify(fired)}`)
  }
})

test('every dead rule stays reachable: the reproducer yields it', () => {
  const dead = DEFECTS.filter(defect => defect.now.kind === 'fires')
  assert.equal(dead.length, 3, 'three dead rules were found and fixed')
  for (const defect of dead) {
    const result = LINTERS[defect.check](defect.now.input)
    assert.ok(result.findings.some(finding => finding.rule === defect.now.rule),
      `${defect.n} ${defect.rule} must fire on its reproducer`)
  }
})

test('the line-number defect stays fixed: the finding lands on the heading', () => {
  const defect = DEFECTS.find(entry => entry.now.kind === 'line')
  assert.ok(defect, 'the ledger carries the line-number defect')
  const result = LINTERS[defect.check](defect.now.input)
  const finding = result.findings.find(entry => entry.rule === defect.now.rule)
  assert.ok(finding, JSON.stringify(result.findings.map(f => f.rule)))
  const line = defect.now.input.split('\n')[finding.line - 1]
  assert.equal(finding.line, defect.now.line)
  assert.match(line, /^#{1,6}\s*v?0\.19\.0/, `line ${finding.line} must be the heading, got ${JSON.stringify(line)}`)
})

test('the sources are counted, not asserted from memory', () => {
  const audit = DEFECTS.filter(defect => defect.foundBy === 'rules audit').length
  const realCorpus = LEDGER.total - audit
  assert.equal(audit, 3)
  assert.equal(realCorpus, 14)
})