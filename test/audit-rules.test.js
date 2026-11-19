// The audit is a gate, so it needs the same both-directions discipline it
// imposes: a rule it must catch, and a shape it must not.
import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyMatchingLiterals, guardOf, ruleNames, suspiciousGuards, testBlocks, directions } from '../scripts/audit-rules.mjs'

test('both emission styles are recognised', () => {
  const add = "add('error', 'a-rule', 0, 'x')"
  const push = "findings.push({ level: 'warn', rule: 'b-rule', message: 'y' })"
  const multiline = "findings.push({\n  level: 'error',\n  rule: 'c-rule',\n  message: `z ${x}`,\n})"
  assert.deepEqual(ruleNames([add, push, multiline].join('\n')).sort(), ['a-rule', 'b-rule', 'c-rule'])
})

test('a fully commented-out rule is not a rule', () => {
  // A commented block would otherwise be reported as a rule with no test.
  assert.deepEqual(ruleNames("// add('error', 'ghost', 0, 'x') was removed"), [])
  assert.deepEqual(ruleNames("  // findings.push({ level: 'warn', rule: 'ghost2' })"), [])
})

test('a trailing comment is kept, on purpose', () => {
  // A scanner this simple cannot tell `//` in a URL string from a comment, and
  // dropping a live rule is worse than keeping a commented one.
  assert.deepEqual(ruleNames("const u = 'https://example.com' // add('error', 'kept', 0, 'x')"), ['kept'])
})

test('the empty-matching guard that shipped is caught', () => {
  // The real bug: expense-claim-check passed /(?:^|\n)/ as a line fallback, which
  // matches every string, so the whole period branch was unreachable.
  assert.deepEqual(emptyMatchingLiterals('!has(PERIOD, /(?:^|\\n)/)').map(o => o.literal), ['/(?:^|\\n)/'])
  assert.equal(emptyMatchingLiterals('/^/').length, 1)
  assert.equal(emptyMatchingLiterals('/.*/').length, 1)
})

test('a URL-shaped regex is not an empty pattern', () => {
  // This was a false positive: the text-matching shortcut saw // inside \/\/.
  assert.deepEqual(emptyMatchingLiterals('source && !/^https?:\\/\\//i.test(source)'), [])
  assert.deepEqual(emptyMatchingLiterals('!/\\.(?:tar|tar\\.gz|tgz)/i.test(name)'), [])
  assert.deepEqual(emptyMatchingLiterals('x !== /re/'), [])
})

test('suspiciousGuards names the rule and the line, and leaves clean guards alone', () => {
  const bad = "if (!has(P, /(?:^|\\n)/)) {\n  add('error', 'date-missing', 0, 'x')\n}\n"
  const found = suspiciousGuards(bad)
  assert.equal(found.length, 1)
  assert.equal(found[0].rule, 'date-missing')
  assert.equal(found[0].line, 1)

  const fine = "if (!labels.includes('x')) {\n  add('error', 'ok-rule', 0, 'x')\n}\n"
  assert.deepEqual(suspiciousGuards(fine), [])
})

test('guardOf looks back at most six lines and reports the line it found', () => {
  const source = "if (a) {\n  1\n  2\n  3\n  4\n  add('error', 'deep', 0, 'x')\n}"
  assert.equal(guardOf(source, source.indexOf("add(")).line, 1)
  const far = `${'x\n'.repeat(9)}add('error', 'far', 0, 'x')`
  assert.equal(guardOf(far, far.indexOf('add(')), null)
})

test('a silent-only rule is reported as ambiguous, not as dead', () => {
  // The audit cannot distinguish "nobody wrote the test" from "cannot fire".
  // directions() only ever answers about assertions, so the wording of the
  // report is what keeps the tool honest.
  const block = "test('x', () => {\n  assert.deepEqual(result.findings, [])\n})"
  assert.deepEqual(directions(block, 'some-rule'), { fires: false, silent: false })
})

test('testBlocks splits per test so one block cannot borrow another assertion', () => {
  const source = "test('a', () => {\n  assert.ok(x)\n})\n\ntest('b', () => {\n  assert.ok(y)\n})"
  assert.equal(testBlocks(source).length, 2)
})
