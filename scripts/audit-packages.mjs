// Package audit for this kit: every package must carry the fields the catalog
// and the identity trail depend on, the README sections that state the honest
// scope, a test file, and a route id that matches the cordis patch. Checks the
// present and gates the future — run it before publishing a new package.
//
//   node scripts/audit-packages.mjs [--json]
//
// Exit 0 clean, 1 gaps found.

import { readdir, readFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packagesDir = resolve(root, 'packages')
const names = (await readdir(packagesDir, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()

const REQUIRED_FIELDS = ['name', 'version', 'description', 'bin', 'license', 'author', 'repository', 'homepage', 'engines']
const REQUIRED_KEYWORDS = ['dsh', 'dsh-plugin', 'deepseek-harness']
const REQUIRED_README = [/^# /m, /## What it decides|## 它判定什么|什么规则/, /Honest scope|诚实边界|诚实/]

const gaps = []
const results = []

for (const name of names) {
  const dir = resolve(packagesDir, name)
  const problems = []
  const pkg = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'))

  for (const field of REQUIRED_FIELDS) {
    if (pkg[field] === undefined || pkg[field] === '') problems.push(`package.json missing ${field}`)
  }
  if (pkg.author !== 'zjukop3') problems.push(`author is ${JSON.stringify(pkg.author)}, expected zjukop3 (the identity trail must stay consistent)`)
  if (pkg.repository?.url && !String(pkg.repository.url).includes('zjukop3')) problems.push('repository url does not point at the zjukop3 account')
  for (const keyword of REQUIRED_KEYWORDS) {
    if (!(pkg.keywords || []).includes(keyword)) problems.push(`keywords missing "${keyword}"`)
  }

  let readme = ''
  try { readme = await readFile(resolve(dir, 'README.md'), 'utf8') } catch { problems.push('README.md missing') }
  for (const pattern of REQUIRED_README) {
    if (readme && !pattern.test(readme)) problems.push(`README missing a section matching ${pattern}`)
  }

  try {
    await access(resolve(dir, 'test', 'index.test.js'))
  } catch { problems.push('test/index.test.js missing') }
  try {
    await access(resolve(dir, 'LICENSE'))
  } catch { problems.push('LICENSE missing') }

  // The cordis patch's route id must match the src's exported name.
  const patch = await readFile(resolve(dir, 'cordis.patch.yml'), 'utf8')
  const idMatch = patch.match(/id:\s*(\S+)/)
  const src = await readFile(resolve(dir, 'src', 'index.js'), 'utf8')
  const nameMatch = src.match(/export const name = '(\S+)'/)
  if (!idMatch) problems.push('cordis.patch.yml has no route id')
  if (!nameMatch) problems.push('src/index.js does not export a name')
  if (idMatch && nameMatch && idMatch[1] !== nameMatch[1]) {
    problems.push(`route id "${idMatch[1]}" does not match exported name "${nameMatch[1]}"`)
  }

  // The npm name must equal the package directory name.
  if (pkg.name !== name) problems.push(`directory ${name} but package name ${pkg.name}`)

  results.push({ name, version: pkg.version, problems })
  if (problems.length > 0) gaps.push({ name, problems })
}

const json = process.argv.includes('--json')
if (json) {
  process.stdout.write(`${JSON.stringify({ packages: results.length, clean: results.length - gaps.length, gaps }, null, 2)}\n`)
} else {
  for (const result of results) {
    if (result.problems.length === 0) console.log(`ok   ${result.name}@${result.version}`)
    else for (const problem of result.problems) console.log(`gap  ${result.name}: ${problem}`)
  }
  console.log(`\n${results.length} packages, ${results.length - gaps.length} clean, ${gaps.length} with gaps`)
}
process.exit(gaps.length === 0 ? 0 : 1)
