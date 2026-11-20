// Every rule needs a test in both directions: one where a bad document makes it
// fire, and one where a good document does not.
//
// This gate exists because four packages in this kit shipped rules that had only
// the firing direction. Each of them passed its own suite while reporting every
// valid document as broken:
//
//   commit-msg   type-missing    fired on 83% of a real 102-commit history
//   onboarding   success-missing fired on 20 of 23 real READMEs
//   release-notes version-missing fired on the Keep a Changelog standard form
//   pr-description what/why/test fired on 19 of 19 real merged PRs
//
// A rule that has only ever been observed to fire is half a rule. The half that
// is missing is the one that says "and here is a document that is fine, and I
// leave it alone" — which is the half that decides whether a stranger keeps the
// tool installed past the first document.
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Default target is this kit; a path argument points it at another kit, which is
// how dsh-verify-kit got audited with the same gate.
const root = process.argv[2] ? resolve(process.argv[2]) : resolve(import.meta.dirname, '..')
const packagesDir = join(root, 'packages')

// Two emission styles, both legitimate:
//   add('error', 'rule-name', line, message)          — vertical-kit
//   findings.push({ level: 'error', rule: 'x', ... }) — verify-kit
// Matching only the first reported zero rules for four of verify-kit's five
// packages, which would have looked like a clean audit of an empty list.
const ADD_CALL = /\badd\(\s*'(?:error|warn)'\s*,\s*'([a-z][a-z0-9-]*)'/g
// 级别也可能来自变量（`const level = requireRollback ? 'error' : 'warn'` 然后
// `add(level, 'rollback-missing', …)`）。只认字面量级别时，这类规则会被漏掉——
// 2026-11-20 实测：privacy 的 rights-missing 与 migration 的 rollback-missing
// 一直不在 190 条里，等于审计对它们视而不见。第二参数才是规则名，与级别无关。
// 第一参数可能是变量、三元、或任何表达式。只认标识符的版本又漏了一次：
// `add(requireSteps ? 'error' : 'warn', 'steps-missing', …)` 既不匹配字面量模式，
// 也不匹配「标识符」模式，于是这条规则从计数里消失（194 -> 193）。
// 判据是「第一参数不是单个字符串字面量」，而不是「长成什么形状」。
const ADD_CALL_DYNAMIC = /\badd\(\s*[^'"\s][^,\n]{0,80}?,\s*'([a-z][a-z0-9-]*)'/g
// [\s\S] not [^{}]: a finding object can span lines, and `message` may carry a
// template with braces. Matching only single-line objects produced a rule named
// `undefined` for citelint.
const PUSH_CALL = /push\(\s*\{[\s\S]{0,200}?level:\s*'(?:error|warn)'[\s\S]{0,200}?rule:\s*'([a-z][a-z0-9-]*)'/g
const PUSH_CALL_REVERSED = /push\(\s*\{[\s\S]{0,200}?rule:\s*'([a-z][a-z0-9-]*)'[\s\S]{0,200}?level:\s*'(?:error|warn)'/g

// Lines that start with `//` are dropped before scanning: a commented-out
// `add('error', 'old-rule', …)` would otherwise be reported as a rule with no
// test, which is a gap that does not exist. Trailing comments are left alone on
// purpose — a `//` inside a string (a URL) is indistinguishable from a comment
// to a scanner this simple, and dropping a live rule is worse than keeping a
// commented one.
export function ruleNames(source) {
  const text = String(source)
    .split('\n')
    .filter(line => !/^\s*\/\//.test(line))
    .join('\n')
  const found = [ADD_CALL, ADD_CALL_DYNAMIC, PUSH_CALL, PUSH_CALL_REVERSED].flatMap(pattern => [...text.matchAll(pattern)].map(match => match[1]))
  return [...new Set(found)]
}

// A regex that matches the empty string, used as a guard, makes the rule beyond
// it dead or always-on. This is not theoretical: `if (!has(X, /(?:^|\n)/))`
// shipped in expense-claim-check and made its whole period branch unreachable,
// because `/(?:^|\n)/` matches every string.
//
// Only literal, obviously-empty patterns are flagged. Anything subtler is left
// to the operator — an audit that cries wolf gets turned off.
// A regex literal in the condition, extracted properly and then tested with the
// engine itself: does this pattern match the empty string? A text-matching
// shortcut flagged `/^https?:\/\//` as an empty pattern because it saw `//`
// inside the escaped slashes, which is exactly the kind of false positive that
// gets a gate switched off.
const REGEX_LITERAL = /(?<![\\\w])\/((?:\\.|[^/\\\n])+)\/([dgimsuvy]*)/g

export function emptyMatchingLiterals(condition) {
  const out = []
  for (const match of String(condition).matchAll(REGEX_LITERAL)) {
    const [, body, flags] = match
    try {
      const pattern = new RegExp(body, flags.replace(/[gy]/g, ''))
      if (pattern.test('')) out.push({ literal: match[0], reason: 'matches the empty string' })
    } catch {
      // Not a valid pattern in isolation (a division, a fragment) — not our call.
    }
  }
  return out
}

// The guard a rule sits behind: the nearest `if (` / `else if (` at or above the
// emission site, within six lines. A heuristic, and labelled as one in the
// output — it names a suspicion, not a verdict.
export function guardOf(source, index) {
  const lines = String(source).slice(0, index).split('\n')
  for (let back = 1; back <= 6; back += 1) {
    const line = lines[lines.length - back]
    if (line === undefined) break
    const match = /\b(?:if|else if)\s*\((.+)$/.exec(line)
    if (match) return { line: lines.length - back + 1, condition: match[1].trim() }
  }
  return null
}

export function suspiciousGuards(source) {
  const text = String(source)
  const out = []
  for (const pattern of [ADD_CALL, PUSH_CALL, PUSH_CALL_REVERSED]) {
    for (const match of text.matchAll(pattern)) {
      const guard = guardOf(text, match.index)
      if (!guard) continue
      const trivial = emptyMatchingLiterals(guard.condition)
      if (trivial.length > 0) {
        out.push({ rule: match[1], line: guard.line, condition: guard.condition.slice(0, 80), pattern: trivial[0].literal })
      }
    }
  }
  return out
}

// Split a test file into blocks at each top-level `test(` so a rule mentioned in
// one test cannot borrow its sibling's assertion.
export function testBlocks(source) {
  return String(source)
    .split(/\n(?=test\()/)
    .map(block => block.trim())
    .filter(Boolean)
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Blocks assert in one of a few shapes, and the shapes differ per package. What
// matters is not the spelling of the assertion but which side of the line it
// lands on:
//
//   silent  — a valid document produces nothing: `deepEqual(findings, [])`,
//             `errors, 0`, `ok, true`, or a negated `.some(...)`.
//   fires   — an invalid document produces something: `ok, false`,
//             `errors, 2`, `rules.includes('x:0')`, a non-empty findings
//             deep-equal, or an affirmative `.some(...)`.
const SILENT = /deepEqual\([^,;\n]*findings\s*,\s*\[\s*\]\s*\)|\b(?:errors?|warnings?)\b[^;\n]{0,24}?,\s*0\b|\bok\b[^;\n]{0,12}?,\s*true\b/
const FIRES = /\bok\b[^;\n]{0,12}?,\s*false\b|\b(?:errors?|warnings?)\b[^;\n]{0,24}?,\s*[1-9]\d*\b|\bincludes\(|(?<![!=])\s*[\w.$]*\.(?:some|find)\(|\.length\s*>\s*0|\.length\s*,\s*[1-9]\d*\b|deepEqual\([^,;\n]*findings\s*,\s*\[(?!\s*\])/

// A rule counts as referenced when its name appears as a quoted string — every
// package names it somewhere, whether through `f.rule === 'x'` or `'x:0'`.
export function directions(block, rule) {
  if (!block.includes(`'${rule}'`) && !block.includes(`"${rule}"`) && !block.includes(`'${rule}:`) && !block.includes(`\`${rule}\``)) {
    return { fires: false, silent: false }
  }
  return { fires: FIRES.test(block), silent: SILENT.test(block) }
}

export async function auditRules() {
  const packages = (await readdir(packagesDir)).filter(name => name.startsWith('dsh-')).sort()
  const rows = []
  for (const pkg of packages) {
    // 纯 patch 包（聚合 bundle）没有 src：它不实现规则，只把别的包的行铺开。
    // 用「有没有 src/index.js」判定，而不是记一份包名清单。
    if (!existsSync(join(packagesDir, pkg, 'src', 'index.js'))) continue
    const src = await readFile(join(packagesDir, pkg, 'src', 'index.js'), 'utf8')
    const rules = ruleNames(src)
    const guards = suspiciousGuards(src)
    const testDir = join(packagesDir, pkg, 'test')
    const testFiles = (await readdir(testDir)).filter(name => name.endsWith('.test.js'))
    const blocks = []
    for (const file of testFiles) {
      const text = await readFile(join(testDir, file), 'utf8')
      blocks.push(...testBlocks(text))
    }
    // A valid document left alone. Prefer a block that also asserts no warnings:
    // that is a package confident enough to claim a good document produces
    // nothing at all, which is what a user is promised.
    const cleanBlock = blocks.some(block => SILENT.test(block))
    const cleanSilentBlock = blocks.some(block => SILENT.test(block) && /warnings?[^;\n]{0,24}?,\s*0\b/.test(block))
    for (const rule of rules) {
      const seen = blocks.map(block => directions(block, rule))
      const guard = guards.find(entry => entry.rule === rule) ?? null
      rows.push({
        package: pkg,
        rule,
        fires: seen.some(direction => direction.fires),
        silent: seen.some(direction => direction.silent) || cleanBlock,
        silentVia: seen.some(direction => direction.silent) ? 'rule assertion' : cleanBlock ? 'clean-document test' : null,
        guard,
      })
    }
    if (!cleanBlock) {
      rows.push({ package: pkg, rule: '(whole package)', fires: false, silent: false, silentVia: null, packageLevel: true })
    }
  }
  return rows
}

export function summarise(rows) {
  const gaps = rows.filter(row => !row.fires || !row.silent)
  return {
    rules: rows.length,
    testedBoth: rows.length - gaps.length,
    gaps: gaps.map(row => ({
      ...row,
      missing: [
        row.packageLevel ? 'no test proves a valid document produces zero errors'
                         : !row.fires ? 'never observed firing' : null,
        !row.silent && !row.packageLevel ? 'never observed staying silent on a valid document' : null,
      ].filter(Boolean),
    })),
  }
}

// Compare real paths: this checkout's directory name is non-ASCII, and
// `import.meta.url` percent-encodes it while argv does not.
if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const rows = await auditRules()
  const result = summarise(rows)
  for (const row of rows) {
    const mark = row.fires && row.silent ? 'both' : row.fires ? 'fire-only' : row.silent ? 'silent-only' : 'NEITHER'
    if (mark === 'both' && !row.guard) continue
    if (mark !== 'both') process.stdout.write(`gap  ${row.package}  ${row.rule}  ${mark}\n`)
    else process.stdout.write(`suspect  ${row.package}  ${row.rule}\n`)
    // A rule with no firing test has two possible explanations and the audit
    // cannot tell them apart: either nobody wrote the test, or the rule cannot
    // fire at all. Only a person writing that test learns which. Say so rather
    // than implying the tool has diagnosed anything.
    if (!row.fires) process.stdout.write(`       └─ either untested or unreachable; writing the firing test is what distinguishes them\n`)
    if (row.guard) {
      process.stdout.write(`       └─ SUSPECT GUARD line ${row.guard.line}: \`${row.guard.condition}\` contains ${row.guard.pattern}, which matches the empty string — the rule behind it may never run\n`)
    }
  }
  process.stdout.write(`\n${result.testedBoth}/${result.rules} rules tested in both directions across ${new Set(rows.map(r => r.package)).size} packages\n`)
  const suspects = rows.filter(row => row.guard)
  if (suspects.length > 0) {
    process.stdout.write(`${suspects.length} rule(s) sit behind a guard that can never be false — reported as suspects, not verdicts\n`)
  }
  if (result.gaps.length > 0) {
    process.stdout.write(`${result.gaps.length} rule(s) missing a direction — a rule observed only to fire is half a rule\n`)
    process.exit(1)
  }
  if (suspects.length > 0) process.exit(1)
}