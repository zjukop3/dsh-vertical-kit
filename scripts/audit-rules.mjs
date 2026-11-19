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
// [\s\S] not [^{}]: a finding object can span lines, and `message` may carry a
// template with braces. Matching only single-line objects produced a rule named
// `undefined` for citelint.
const PUSH_CALL = /push\(\s*\{[\s\S]{0,200}?level:\s*'(?:error|warn)'[\s\S]{0,200}?rule:\s*'([a-z][a-z0-9-]*)'/g
const PUSH_CALL_REVERSED = /push\(\s*\{[\s\S]{0,200}?rule:\s*'([a-z][a-z0-9-]*)'[\s\S]{0,200}?level:\s*'(?:error|warn)'/g

export function ruleNames(source) {
  const text = String(source)
  const found = [ADD_CALL, PUSH_CALL, PUSH_CALL_REVERSED].flatMap(pattern => [...text.matchAll(pattern)].map(match => match[1]))
  return [...new Set(found)]
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
    const src = await readFile(join(packagesDir, pkg, 'src', 'index.js'), 'utf8')
    const rules = ruleNames(src)
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
      rows.push({
        package: pkg,
        rule,
        fires: seen.some(direction => direction.fires),
        silent: seen.some(direction => direction.silent) || cleanBlock,
        silentVia: seen.some(direction => direction.silent) ? 'rule assertion' : cleanBlock ? 'clean-document test' : null,
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
    if (mark !== 'both') process.stdout.write(`gap  ${row.package}  ${row.rule}  ${mark}\n`)
  }
  process.stdout.write(`\n${result.testedBoth}/${result.rules} rules tested in both directions across ${new Set(rows.map(r => r.package)).size} packages\n`)
  if (result.gaps.length > 0) {
    process.stdout.write(`${result.gaps.length} rule(s) missing a direction — a rule observed only to fire is half a rule\n`)
    process.exit(1)
  }
}