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
import { lintHandover } from '../packages/dsh-handover-check/src/index.js'
import { lintTestReport } from '../packages/dsh-test-report-check/src/index.js'
import { lintWeeklyReport } from '../packages/dsh-weekly-report-check/src/index.js'
import { lintTables } from '../../dsh-verify-kit/packages/dsh-tablelint/src/index.js'
import { lintPerfReport } from '../packages/dsh-perf-report-check/src/index.js'
import { lintMigrationGuide } from '../packages/dsh-migration-guide-check/src/index.js'
import { lintSpecDoc } from '../packages/dsh-spec-doc-check/src/index.js'
import { lintApiDoc } from '../packages/dsh-api-doc-check/src/index.js'
import { lintResume } from '../packages/dsh-resume-check/src/index.js'
import { lintPrivacyNotice } from '../packages/dsh-privacy-notice-check/src/index.js'
import { lintBugReport } from '../packages/dsh-bug-report-check/src/index.js'
import { lintPluginEntry } from '../packages/dsh-plugin-entry-check/src/index.js'
import { lintMeetingNotes } from '../packages/dsh-meeting-notes-check/src/index.js'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  'handover-check': lintHandover,
  'test-report-check': lintTestReport,
  'weekly-report-check': lintWeeklyReport,
  'tablelint': lintTables,
  'perf-report-check': lintPerfReport,
  'migration-guide-check': lintMigrationGuide,
  'spec-doc-check': lintSpecDoc,
  'api-doc-check': lintApiDoc,
  'resume-check': lintResume,
  'privacy-notice-check': lintPrivacyNotice,
  'bug-report-check': lintBugReport,
  'plugin-entry-check': lintPluginEntry,
  'meeting-notes-check': lintMeetingNotes,
}

const ruleOf = name => name.split(' / ')[0]

test('the ledger is well formed and every entry names a linter this test can run', () => {
  // 总数由台账自己算：手写一个 21 在这里，等于让测试跟着台账一起过期。
  assert.equal(LEDGER.total, DEFECTS.length)
  for (const defect of DEFECTS) {
    assert.ok(defect.n > 0, 'a defect has a number')
    assert.ok(defect.check, `${defect.n}: names a check`)
    assert.ok(defect.rule, `${defect.n}: names a rule`)
    assert.ok(defect.wrong && defect.right && defect.lesson, `${defect.n}: says what it was, what it is, and why`)
    assert.ok(defect.fixedIn, `${defect.n}: names the version that fixed it`)
    assert.ok(defect.foundBy, `${defect.n}: names how it was found`)
    assert.ok(LINTERS[defect.check], `${defect.n}: ${defect.check} has a linter here`)
    assert.ok(['silent', 'fires', 'line', 'route'].includes(defect.now.kind), `${defect.n}: known assertion kind`)
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

test('every rule that was missing a firing path now fires on its reproducer', () => {
  // Three were dead code (never reachable) and one was a false negative (a rule
  // that existed but accepted a non-answer). Both kinds must fire now.
  const dead = DEFECTS.filter(defect => defect.now.kind === 'fires')
  // 不写死条数：数字会跟着台账过期，这是这一族里最后剩下的那处手写。
  assert.ok(dead.length >= 4, `expected at least four firing defects, found ${dead.length}`)
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
  const ownArtifact = DEFECTS.filter(defect => /^own (?!history|READMEs|CHANGELOGs|ADRs|runbooks)/.test(defect.foundBy)).length
  const thirdParty = DEFECTS.filter(defect => defect.foundBy.startsWith('third-party')).length
  const ownReal = LEDGER.total - audit - thirdParty - ownArtifact
  // 精确数字每加一条台账就得改，那正是过期的开始。这里只断言「每一类都非空」，
  // 以及四类加起来等于总数——分布本身在站点上从台账算，不在这里手抄。
  assert.ok(audit >= 1, '规则审计这一类不该是空的')
  assert.ok(thirdParty >= 1, '别人的文件这一类不该是空的')
  assert.ok(ownArtifact >= 1, '写自己的真实产物这一类不该是空的')
  assert.ok(ownReal >= 1, '把包真的装起来调一遍这一类不该是空的')
  assert.equal(audit + thirdParty + ownArtifact + ownReal, LEDGER.total)
})
// route 类缺陷的回放：把包装起来、按文档的第二种输入调一次。
// 这是本轮唯一一类「静态读代码看不出来」的缺陷——CLI 一直是好的，坏的是端点。
test('route 类缺陷的回放：path 分支给出与 text 分支相同的答复', async () => {
  const routes = DEFECTS.filter(defect => defect.now.kind === 'route')
  assert.equal(routes.length, 2, 'ledger 里有两条 route 类缺陷')
  for (const defect of routes) {
    const mod = await import(`../packages/dsh-${defect.check}/src/index.js`)
    const state = { route: null }
    mod.apply({ webServer: { register(spec) { state.route = spec } }, effect(fn) { fn() } }, {})
    assert.ok(state.route, `${defect.check}: apply() 注册了路由`)
    const dir = mkdtempSync(join(tmpdir(), 'dsh-defect-'))
    const file = join(dir, 'doc.md')
    writeFileSync(file, defect.now.input, 'utf8')
    const server = createServer((req, res) => state.route.handler(req, res))
    await new Promise(done => server.listen(0, '127.0.0.1', done))
    try {
      const { port } = server.address()
      const response = await fetch(`http://127.0.0.1:${port}${defect.now.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: file }),
      })
      const body = await response.json()
      assert.equal(response.status, 200, `${defect.n} ${defect.check}: ${JSON.stringify(body).slice(0, 140)}`)
      assert.deepEqual(body, LINTERS[defect.check](defect.now.input), `${defect.n} ${defect.check}: path 与 text 不一致`)
    } finally {
      await new Promise(done => server.close(done))
      rmSync(dir, { recursive: true, force: true })
    }
  }
})
