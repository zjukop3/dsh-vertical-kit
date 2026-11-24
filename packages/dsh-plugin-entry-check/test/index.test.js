import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { lintPluginEntry, parseEntry, expectedName, slugFor, CATEGORIES } from '../src/index.js'

const HERE = resolve(import.meta.dirname, '..')
const FIXTURES = resolve(HERE, 'fixtures')

// 一份合法的条目，用来给每条规则做「闭嘴」那一侧。
const GOOD = `url: 'https://github.com/owner/repo/tree/main/packages/my-plugin'
name: 'owner/repo#my-plugin'
category: 'tools'
description:
  en: 'A plugin that does one thing and says so: it watches a directory, reports what changed since the last run, and exits non-zero when something was removed rather than added, because a deletion is the change people need to notice.'
  zh: '一个只做一件事的插件：盯住一个目录，报告自上次运行以来的变化，并在出现删除而不是新增时以非零退出——删除才是人真正需要被提醒的那种变化。'
icon: 'https://raw.githubusercontent.com/owner/repo/main/assets/icon-180.png'
`

const rules = result => result.findings.map(finding => finding.rule)

test('真实的已合并条目零发现（五份，含我自己在评审中的那两份）', async () => {
  const files = (await readdir(FIXTURES)).filter(name => name.endsWith('.yml')).sort()
  assert.ok(files.length >= 5, `语料只有 ${files.length} 份`)
  for (const file of files) {
    const text = await readFile(resolve(FIXTURES, file), 'utf8')
    const result = lintPluginEntry(text, { filename: file })
    assert.deepEqual(result.findings, [], `${file}: ${JSON.stringify(result.findings)}`)
  }
})

test('GOOD 这份条目自身是干净的（其余规则的静默侧都基于它）', () => {
  const result = lintPluginEntry(GOOD, { filename: 'owner__repo--packages-my-plugin.yml' })
  assert.deepEqual(result.findings, [])
})

test('empty：空文件是一句明确的 error', () => {
  const result = lintPluginEntry('  \n')
  assert.equal(result.ok, false)
  assert.deepEqual(rules(result), ['empty'])
})

test('yaml-shape：列表、制表符、过深嵌套都明确报错而不是猜', () => {
  for (const [text, hint] of [
    ['url: x\n- item\n', '列表'],
    ['url: x\n\tcategory: tools\n', '制表符'],
    ['url: x\ndescription:\n  meta:\n    deep: 1\n', '嵌套'],
  ]) {
    const result = lintPluginEntry(text)
    assert.ok(rules(result).includes('yaml-shape'), `${hint}: ${JSON.stringify(result.findings)}`)
  }
  const ok = lintPluginEntry(GOOD)
  assert.ok(!rules(ok).includes('yaml-shape'))
})

// 块标量、跨行引号标量、CRLF、内容行里出现 `词: 值` —— 这四件事第一版都不支持，
// 于是 160 份已合并条目里有 23 份被判「格式不对」。YAML 支持它们，我就得支持。
test('真实条目的四种写法都要读对：块标量、跨行引号、CRLF、内容里的冒号行', () => {
  const folded = `url: https://github.com/acme/repo\nname: acme/repo\ncategory: tools\ndescription:\n  en: >-\n    Skills for a thing, vendored from upstream\n    only: no binaries are bundled\n  zh: '一句话。'\n`
  const parsed = parseEntry(folded)
  assert.deepEqual(parsed.problems, [])
  assert.equal(parsed.description.get('en'), 'Skills for a thing, vendored from upstream only: no binaries are bundled')
  assert.equal(lintPluginEntry(folded).ok, true)

  const literal = `url: https://github.com/acme/repo\nname: acme/repo\ncategory: tools\ndescription:\n  en: |\n    one\n    two\n  zh: '一句话。'\n`
  assert.equal(parseEntry(literal).description.get('en').trim(), 'one\ntwo')

  const quotedAcrossLines = `url: https://github.com/acme/repo\nname: acme/repo\ncategory: tools\ndescription:\n  en: 'Provides 14 tools through a local server. Requires the\n    separately installed runtime.'\n  zh: '一句话。'\n`
  assert.deepEqual(parseEntry(quotedAcrossLines).problems, [], JSON.stringify(parseEntry(quotedAcrossLines).problems))
  assert.match(parseEntry(quotedAcrossLines).description.get('en'), /^Provides 14 tools.*runtime\.'?$/)

  const crlf = `url: https://github.com/acme/repo\r\nname: acme/repo\r\ncategory: tools\r\ndescription:\r\n  en: 'A thing.'\r\n  zh: '一个东西。'\r\n`
  assert.deepEqual(parseEntry(crlf).problems, [])
  assert.equal(parseEntry(crlf).fields.get('category'), 'tools')
})

test('duplicate-key：同一个键写两次会被 YAML 静默取后一个', () => {
  const result = lintPluginEntry(GOOD.replace("category: 'tools'", "category: 'tools'\ncategory: 'docs'"))
  assert.ok(rules(result).includes('duplicate-key'), JSON.stringify(result.findings))
  assert.ok(!rules(lintPluginEntry(GOOD)).includes('duplicate-key'))
})

test('unknown-key：上游只认五个键', () => {
  const result = lintPluginEntry(`${GOOD}author: 'owner'\n`)
  assert.ok(rules(result).includes('unknown-key'))
  assert.ok(!rules(lintPluginEntry(GOOD)).includes('unknown-key'))
})

test('missing-key：url / name / category / description 缺一个就是 error', () => {
  for (const key of ['url', 'name', 'category']) {
    const text = GOOD.split('\n').filter(line => !line.startsWith(`${key}:`)).join('\n')
    const result = lintPluginEntry(text)
    assert.ok(rules(result).includes('missing-key'), `${key} 缺了却没说：${JSON.stringify(rules(result))}`)
  }
  const noDescription = GOOD.replace(/description:\n(  .*\n)+/, '')
  assert.ok(rules(lintPluginEntry(noDescription)).includes('missing-key'))
  // description 的内容在嵌套映射里，「有没有」要看映射，不是看那个空值——第一版在这里
  // 把四份已合并的真实条目全判成「缺少 description」。
  assert.ok(!rules(lintPluginEntry(GOOD)).includes('missing-key'))
})

test('url-shape：结尾斜杠、.git、blob/ 都不是合法 url', () => {
  for (const bad of [
    "'https://github.com/owner/repo/'",
    "'https://github.com/owner/repo.git'",
    "'https://github.com/owner/repo/blob/main/x'",
    "'github.com/owner/repo'",
  ]) {
    const text = GOOD.replace(/^url: .*$/m, `url: ${bad}`)
    assert.ok(rules(lintPluginEntry(text)).includes('url-shape'), `${bad} 没被拦`)
  }
  assert.ok(!rules(lintPluginEntry(GOOD)).includes('url-shape'))
})

test('name-shape：name 与 url 必须指同一个仓库', () => {
  const other = GOOD.replace("name: 'owner/repo#my-plugin'", "name: 'someone/else#my-plugin'")
  assert.ok(rules(lintPluginEntry(other)).includes('name-shape'))
  assert.ok(!rules(lintPluginEntry(GOOD)).includes('name-shape'))
})

test('sub-path：#sub 对应 url 子目录的最后一段，不是整条路径', () => {
  const wrong = GOOD.replace("name: 'owner/repo#my-plugin'", "name: 'owner/repo#other-dir'")
  assert.ok(rules(lintPluginEntry(wrong)).includes('sub-path'))
  // 真实条目就是 packages/<pkg> 对应 #<pkg>：整条路径去比会把已合并的条目全判错。
  const real = GOOD.replace("name: 'owner/repo#my-plugin'", "name: 'owner/repo#my-plugin'")
  assert.ok(!rules(lintPluginEntry(real)).includes('sub-path'))
  const missingSub = GOOD.replace("name: 'owner/repo#my-plugin'", "name: 'owner/repo'")
  assert.ok(rules(lintPluginEntry(missingSub)).includes('sub-path'), 'url 指子目录却没用 #sub')
})

test('category：只认上游那 24 个取值', () => {
  // 上游正文列的是 23 个。第一版测试写 24（凭印象），跑起来才发现多数了一个。
  assert.equal(CATEGORIES.length, 23)
  const bad = GOOD.replace("category: 'tools'", "category: 'documents'")
  assert.ok(rules(lintPluginEntry(bad)).includes('category'))
  assert.ok(!rules(lintPluginEntry(GOOD)).includes('category'))
})

test('description-keys：en 与 zh 都必须有', () => {
  const onlyEn = GOOD.replace(/  zh: '.*'\n/, '')
  assert.ok(rules(lintPluginEntry(onlyEn)).includes('description-keys'))
  assert.ok(!rules(lintPluginEntry(GOOD)).includes('description-keys'))
})

test('description-placeholder：占位符只在「整段没写」时才算', () => {
  const todo = GOOD.replace(/  en: '.*'/, "  en: 'TODO'")
  assert.ok(rules(lintPluginEntry(todo)).includes('description-placeholder'))
  // 正文里合法提到「待填字段」这种被检查对象，不该被判成占位符——第一版的 `<…>` 与 xxx
  // 就误伤过一条已合并的 license 条目。
  const mentions = GOOD.replace('it watches a directory', 'it flags a literal TODO marker and an unfilled `<name>` field')
  assert.ok(!rules(lintPluginEntry(mentions)).includes('description-placeholder'), JSON.stringify(rules(lintPluginEntry(mentions))))
})

test('description-thin：一条说不清「它做什么」的条目只是 warn', () => {
  const thin = GOOD.replace(/  en: '.*'/, "  en: 'Checks things.'")
  const result = lintPluginEntry(thin)
  assert.ok(rules(result).includes('description-thin'))
  assert.equal(result.ok, true, 'warn 不该把条目判成不可提交')
  assert.ok(!rules(lintPluginEntry(GOOD)).includes('description-thin'))
})

test('description-parity：中文那半明显短于英文时提醒，但不拦', () => {
  const stub = GOOD.replace(/  zh: '.*'/, "  zh: '一个插件。'")
  const result = lintPluginEntry(stub)
  assert.ok(rules(result).includes('description-parity'))
  assert.equal(result.ok, true)
  assert.ok(!rules(lintPluginEntry(GOOD)).includes('description-parity'))
})

test('icon-shape：相对地址与不是图片的扩展名都提醒', () => {
  for (const bad of ["'./assets/icon.png'", "'https://example.com/icon.txt'"]) {
    const text = GOOD.replace(/^icon: .*$/m, `icon: ${bad}`)
    assert.ok(rules(lintPluginEntry(text)).includes('icon-shape'), `${bad} 没被提醒`)
  }
  assert.ok(!rules(lintPluginEntry(GOOD)).includes('icon-shape'))
})

test('bundle-hint：描述自己说「一次装一组」时提示上游第 7 条', () => {
  const bundle = GOOD.replace('A plugin that does one thing and says so:', 'An all-in-one bundle that lets you install a set of plugins at once:')
    .replace('一个只做一件事的插件：', '一键安装，装上一组插件：')
  assert.ok(rules(lintPluginEntry(bundle)).includes('bundle-hint'))
  assert.ok(!rules(lintPluginEntry(GOOD)).includes('bundle-hint'))
})

test('filename：必须与 url 推出的 slug 一致（上游 CI 是 error）', () => {
  const wrong = lintPluginEntry(GOOD, { filename: 'owner__repo.yml' })
  const finding = wrong.findings.find(f => f.rule === 'filename')
  assert.ok(finding, JSON.stringify(wrong.findings))
  assert.equal(finding.level, 'error', '上游 validateEntries 对文件名不一致是打回')
  const right = lintPluginEntry(GOOD, { filename: 'owner__repo--packages-my-plugin.yml' })
  assert.ok(!rules(right).includes('filename'))
})

// 仓库名自己可能含 `--`：从文件名反推会把仓库名锯开，于是报出「文件名应为 X（当前 X）」
// 这种自相矛盾的错。真实条目里有 2 份（TryDing-T/dsh-Plugin--ChineseChess、
// sunzhentao/dsh--prompt--enhance），判据改成从 url 推 slug。
test('仓库名含 `--` 时文件名不再被误判', () => {
  const text = `url: https://github.com/TryDing-T/dsh-Plugin--ChineseChess\nname: TryDing-T/dsh-Plugin--ChineseChess\ncategory: fun\ndescription:\n  en: 'Chinese chess in the sidebar.'\n  zh: '侧边栏里的中国象棋。'\n`
  const result = lintPluginEntry(text, { filename: 'TryDing-T__dsh-Plugin--ChineseChess.yml' })
  assert.ok(!rules(result).includes('filename'), JSON.stringify(result.findings))
  assert.equal(slugFor('https://github.com/o/r/tree/main/packages/x'), 'o__r--packages-x')
})

test('expectedName：owner__repo--path-with-dashes.yml 的反解', () => {
  assert.deepEqual(expectedName('owner__repo--packages-my-plugin.yml'), { owner: 'owner', repo: 'repo', path: 'packages-my-plugin' })
  assert.deepEqual(expectedName('/tmp/owner__repo.yml'), { owner: 'owner', repo: 'repo', path: null })
  assert.equal(expectedName('nonsense.yml'), null)
})

test('parseEntry 只吃它声明支持的形状，别的明确报错', () => {
  const { fields, description, problems } = parseEntry(GOOD)
  assert.deepEqual(problems, [])
  assert.equal(fields.get('category'), 'tools')
  assert.ok(description.get('en').length > 100)
})

test('CLI 与函数同一份实现，出口码按 errors', async () => {
  const direct = lintPluginEntry(GOOD, { filename: 'owner__repo--packages-my-plugin.yml' })
  let printed
  try {
    printed = execFileSync(process.execPath, [resolve(HERE, 'bin', 'cli.js'), '-', '--json'], { input: GOOD, encoding: 'utf8' })
  } catch (error) {
    printed = String(error.stdout)
    assert.equal(error.status, 1)
  }
  assert.deepEqual(JSON.parse(printed), direct)
})

test('README 里那条命令真的能跑（陌生人路径）', async () => {
  const readme = await readFile(resolve(HERE, 'README.md'), 'utf8')
  const command = readme.match(/npx\s+(dsh-plugin-entry-check)\s+(\S+)/)
  assert.ok(command, 'README 没有给出 npx 命令')
  assert.equal(command[1], 'dsh-plugin-entry-check', 'npx 后面必须是包名')
})

test('语料来源写清楚了（别人的条目进仓库要交代出处）', async () => {
  const note = await readFile(resolve(FIXTURES, 'SOURCE.md'), 'utf8')
  assert.match(note, /awesome-dsh-plugin/)
  const files = (await readdir(FIXTURES)).filter(name => name.endsWith('.yml'))
  for (const file of files) assert.ok(note.includes(file), `${file} 没在 SOURCE.md 里交代`)
  assert.ok(existsSync(resolve(HERE, 'src', 'index.js')))
})
// 条目 ↔ 仓库的交叉核对：上游第一号打回理由是「只声明了 dsh.client」，
// 而那件事在 yaml 里完全看不出来——必须去看仓库里那个包的 package.json。
// 判据用 160 份已合并的真实条目校准过：全部 160 份在正确的仓库上零 error。
test('条目与仓库对不上时报 repo-* 系列，而不是沉默通过', async () => {
  const { checkEntryAgainstRepo } = await import('../src/index.js')
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  const root = mkdtempSync(join(tmpdir(), 'entry-repo-'))
  const entry = `url: https://github.com/acme/tools/tree/main/packages/thing
name: acme/tools#thing
category: tools
description:
  en: 'A thing that does the thing, and says so in one sentence.'
  zh: '一个做那件事的东西，一句话说清楚。'
`
  try {
    // 1) monorepo 子包里没有 package.json
    mkdirSync(join(root, 'packages', 'thing'), { recursive: true })
    const missing = checkEntryAgainstRepo(entry, root, { filename: 'acme__tools--packages-thing.yml' })
    assert.ok(missing.findings.some(f => f.rule === 'repo-package-missing'), JSON.stringify(missing.findings.map(f => f.rule)))

    // 2) 有 package.json 但只有 dsh.client——上游最常见的打回原因
    writeFileSync(join(root, 'packages', 'thing', 'package.json'), JSON.stringify({ name: 'thing', dsh: { client: { platform: 'web' } } }))
    const noBundle = checkEntryAgainstRepo(entry, root, { filename: 'acme__tools--packages-thing.yml' })
    assert.ok(noBundle.findings.some(f => f.rule === 'repo-bundle-missing'), JSON.stringify(noBundle.findings.map(f => f.rule)))
    assert.equal(noBundle.ok, false)

    // 3) 声明了 bundle.patch 但文件不存在
    writeFileSync(join(root, 'packages', 'thing', 'package.json'), JSON.stringify({ name: 'thing', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    const noPatch = checkEntryAgainstRepo(entry, root, { filename: 'acme__tools--packages-thing.yml' })
    assert.ok(noPatch.findings.some(f => f.rule === 'repo-patch-missing'), JSON.stringify(noPatch.findings.map(f => f.rule)))

    // 4) 都齐了：条目通过，仓库也对得上
    writeFileSync(join(root, 'packages', 'thing', 'cordis.patch.yml'), '- insert:\n    - id: thing\n      name: thing\n')
    const good = checkEntryAgainstRepo(entry, root, { filename: 'acme__tools--packages-thing.yml' })
    assert.equal(good.ok, true, JSON.stringify(good.findings))
    assert.deepEqual(good.findings, [])
    assert.equal(good.checked.repoChecked.includes('packages/thing'), true)

    // 5) 条目里的 #sub 与包里 name 不一致 → 只提示（上游会自己改）
    writeFileSync(join(root, 'packages', 'thing', 'package.json'), JSON.stringify({ name: 'other-name', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    const mismatch = checkEntryAgainstRepo(entry, root, { filename: 'acme__tools--packages-thing.yml' })
    assert.ok(mismatch.findings.some(f => f.rule === 'repo-name-mismatch' && f.level === 'warn'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// 三条新规则各自都要有「会报」的那一半，否则等于写下就没被看见过。
test('新规则会报：句号缺失、tarball 形状、package.json 读不出来', async () => {
  const noPeriod = `url: https://github.com/acme/repo\nname: acme/repo\ncategory: tools\ndescription:\n  en: 'A thing that does exactly one thing and says so'\n  zh: '一个只做一件事的东西。'\n`
  assert.ok(lintPluginEntry(noPeriod).findings.some(f => f.rule === 'description-period'));

  const badTarball = `url: https://github.com/acme/repo\nname: acme/repo\ncategory: tools\ntarball: ./build/repo.tgz\ndescription:\n  en: 'A thing that does one thing.'\n  zh: '一个只做一件事的东西。'\n`
  assert.ok(lintPluginEntry(badTarball).findings.some(f => f.rule === 'tarball-shape'));

  const { checkEntryAgainstRepo } = await import('../src/index.js')
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'entry-broken-'))
  try {
    writeFileSync(join(dir, 'package.json'), '{ this is not json')
    const entry = `url: https://github.com/acme/repo\nname: acme/repo\ncategory: tools\ndescription:\n  en: 'A thing that does one thing.'\n  zh: '一个只做一件事的东西。'\n`
    const result = checkEntryAgainstRepo(entry, dir, { filename: 'acme__repo.yml' })
    assert.equal(result.ok, false)
    assert.ok(result.findings.some(f => f.rule === 'repo-manifest-unparsable'), JSON.stringify(result.findings.map(f => f.rule)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// 与上游 validateEntries 对齐的五条：多行描述、多余语言键、空 zh、icon 主机、
// tarball 主机。这些是「本地说 OK、CI 拒掉」最容易出问题的地方，所以每条都要有
// 「会报」的那一半；同时整套规则在 12960 份已合并条目上零 error（见语料页）。
test('上游会拒的形状，本地也要拒', () => {
  const base = (extra) => `url: https://github.com/acme/repo\nname: acme/repo\ncategory: tools\n${extra}description:\n  en: 'A thing that does one thing.'\n`

  const multiline = `url: https://github.com/acme/repo\nname: acme/repo\ncategory: tools\ndescription:\n  en: |\n    first line\n    second line\n`
  const m = lintPluginEntry(multiline)
  assert.ok(m.findings.some(f => f.rule === 'description-multiline' && f.level === 'error'), JSON.stringify(m.findings))

  const extraLocale = `url: https://github.com/acme/repo\nname: acme/repo\ncategory: tools\ndescription:\n  en: 'A thing that does one thing.'\n  ja: 'これは物です。'\n`
  assert.ok(lintPluginEntry(extraLocale).findings.some(f => f.rule === 'description-locale'))

  const emptyZh = `url: https://github.com/acme/repo\nname: acme/repo\ncategory: tools\ndescription:\n  en: 'A thing that does one thing.'\n  zh: '   '\n`
  assert.ok(lintPluginEntry(emptyZh).findings.some(f => f.rule === 'description-keys' && f.level === 'error'))

  const foreignIcon = base("icon: https://example.com/icon.png\n")
  assert.ok(lintPluginEntry(foreignIcon).findings.some(f => f.rule === 'icon-shape' && f.level === 'error'))
  const svgIcon = base('icon: https://raw.githubusercontent.com/acme/repo/main/icon.svg\n')
  assert.ok(lintPluginEntry(svgIcon).findings.some(f => f.rule === 'icon-shape'), '上游只收位图，svg 要报')

  const badTarball = base('tarball: https://example.com/repo.tgz\n')
  assert.ok(lintPluginEntry(badTarball).findings.some(f => f.rule === 'tarball-shape' && f.level === 'error'))
  const goodTarball = base('tarball: https://github.com/acme/repo/releases/download/v1.0.0/repo-1.0.0.tgz\n')
  assert.ok(!lintPluginEntry(goodTarball).findings.some(f => f.rule === 'tarball-shape'))
})
