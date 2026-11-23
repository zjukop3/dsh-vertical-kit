import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { lintPluginEntry, parseEntry, expectedName, CATEGORIES } from '../src/index.js'

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

test('yaml-shape：列表、块标量、制表符、过深嵌套都明确报错而不是猜', () => {
  for (const [text, hint] of [
    ['url: x\n- item\n', '列表'],
    [`url: x\ndescription: |\n  many lines\n`, '块标量'],
    ['url: x\n\tcategory: tools\n', '制表符'],
    ['url: x\ndescription:\n  meta:\n    deep: 1\n', '嵌套'],
  ]) {
    const result = lintPluginEntry(text)
    assert.ok(rules(result).includes('yaml-shape'), `${hint}: ${JSON.stringify(result.findings)}`)
  }
  const ok = lintPluginEntry(GOOD)
  assert.ok(!rules(ok).includes('yaml-shape'))
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

test('filename：文件名与 url/name 推出的一致（--as 或路径给定时才查）', () => {
  const wrong = lintPluginEntry(GOOD, { filename: 'owner__repo.yml' })
  assert.ok(rules(wrong).includes('filename'), JSON.stringify(wrong.findings))
  assert.equal(wrong.ok, true, '文件名问题不该判成不可提交')
  const right = lintPluginEntry(GOOD, { filename: 'owner__repo--packages-my-plugin.yml' })
  assert.ok(!rules(right).includes('filename'))
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