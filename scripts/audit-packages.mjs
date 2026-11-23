// Package audit for this kit: every package must carry the fields the catalog
// and the identity trail depend on, the README sections that state the honest
// scope, a test file, and a route id that matches the cordis patch. Checks the
// present and gates the future — run it before publishing a new package.
//
//   node scripts/audit-packages.mjs [--json]
//
// Exit 0 clean, 1 gaps found.

import { readdir, readFile, access } from 'node:fs/promises'
import { existsSync, constants } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packagesDir = resolve(root, 'packages')
const names = (await readdir(packagesDir, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()

const REQUIRED_FIELDS = ['name', 'version', 'description', 'bin', 'license', 'author', 'repository', 'homepage', 'engines']
// 纯 patch 包（聚合 bundle）不发布 bin、也没有 src 入口：它只有一份 cordis.patch.yml。
// 用「有 dsh.bundle.patch 且没有 main」判定，而不是记一份包名清单。
const PATCH_ONLY_FIELDS = REQUIRED_FIELDS.filter(field => field !== 'bin')
const PATCH_ONLY_README = [/^# /m, /## What it installs|## 装什么/, /Honest scope|Limitations|诚实/]
const REQUIRED_KEYWORDS = ['dsh', 'dsh-plugin', 'deepseek-harness']
const REQUIRED_README = [/^# /m, /## What it decides|## 它判定什么|什么规则/, /Honest scope|诚实边界|诚实/]

const gaps = []
const results = []

for (const name of names) {
  const dir = resolve(packagesDir, name)
  const problems = []
  const pkg = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'))

  const patchOnly = Boolean(pkg.dsh?.bundle?.patch) && !pkg.main && !pkg.bin
  for (const field of patchOnly ? PATCH_ONLY_FIELDS : REQUIRED_FIELDS) {
    if (pkg[field] === undefined || pkg[field] === '') problems.push(`package.json missing ${field}`)
  }
  if (pkg.author !== 'zjukop3') problems.push(`author is ${JSON.stringify(pkg.author)}, expected zjukop3 (the identity trail must stay consistent)`)
  if (pkg.repository?.url && !String(pkg.repository.url).includes('zjukop3')) problems.push('repository url does not point at the zjukop3 account')
  for (const keyword of REQUIRED_KEYWORDS) {
    if (!(pkg.keywords || []).includes(keyword)) problems.push(`keywords missing "${keyword}"`)
  }

  let readme = ''
  try { readme = await readFile(resolve(dir, 'README.md'), 'utf8') } catch { problems.push('README.md missing') }
  for (const pattern of patchOnly ? PATCH_ONLY_README : REQUIRED_README) {
    if (readme && !pattern.test(readme)) problems.push(`README missing a section matching ${pattern}`)
  }

  try {
    // 纯 patch 包没有自己的 src，测试在 kit 根的 test/suite.test.js；
    // 那里断言的是行↔依赖↔版本，比一个包内空测试更有意义。
    await access(resolve(dir, 'test', 'index.test.js'))
  } catch {
    if (patchOnly) {
      try {
        await access(resolve(root, 'test', 'suite.test.js'))
      } catch { problems.push('neither test/index.test.js nor test/suite.test.js present') }
    } else problems.push('test/index.test.js missing')
  }
  try {
    await access(resolve(dir, 'LICENSE'))
  } catch { problems.push('LICENSE missing') }

  // bin 里必须有一个与包名同名的键：`npx <包名>` 只认得这个名字。
  // 2026-11-23 实测：27 个包的 README 都写 `npx commit-msg-check …`，而 npx 会把
  // 第一段当成**包名**去 registry 找，那个包不存在 → 404。首跑即失败，且所有包都中。
  if (pkg.bin && !Object.prototype.hasOwnProperty.call(pkg.bin, pkg.name)) {
    problems.push(`bin has no entry named "${pkg.name}" — ` + 'npx <package-name> cannot resolve it')
  }

  // bin 目标必须是可执行文件。npm 在 publish 时会把不可执行的 bin 静默丢掉，
  // 只留一行 warn，结果 npx <cli> 直接找不到命令——2026-11-20 三个新包就是这么丢的。
  for (const [command, target] of Object.entries(pkg.bin || {})) {
    const binPath = resolve(dir, target)
    try {
      await access(binPath, constants.X_OK)
    } catch {
      problems.push(`bin "${command}" -> ${target} is not executable (npm drops it silently on publish)`)
    }
  }

  // The cordis patch's route id must match the src's exported name.
  const patch = await readFile(resolve(dir, 'cordis.patch.yml'), 'utf8')
  const idMatch = patch.match(/id:\s*(\S+)/)
  if (!idMatch) problems.push('cordis.patch.yml has no route id')
  if (patchOnly) {
    // 聚合包：每行必须指向一个有名字的包，且行 id 不能与成员自己的 id 撞车
    // （撞车会被 Loader 判重复，见 test/suite.test.js）。
    const rows = [...patch.matchAll(/id:\s*(\S+)\s*\n\s*name:\s*'([^']+)'/g)]
    if (rows.length === 0) problems.push('patch-only bundle inserts no rows')
    if (new Set(rows.map(r => r[1])).size !== rows.length) problems.push('patch-only bundle has duplicate row ids')
  } else {
    const src = existsSync(resolve(dir, 'src', 'index.js')) ? await readFile(resolve(dir, 'src', 'index.js'), 'utf8') : ''
    const nameMatch = src.match(/export const name = '(\S+)'/)
    if (!nameMatch) problems.push('src/index.js does not export a name')
    if (idMatch && nameMatch && idMatch[1] !== nameMatch[1]) {
      problems.push(`route id "${idMatch[1]}" does not match exported name "${nameMatch[1]}"`)
    }
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
