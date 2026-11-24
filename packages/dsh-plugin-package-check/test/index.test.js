import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { lintPluginPackage, RULES } from '../src/index.js'

const HERE = resolve(import.meta.dirname, '..')
const KIT = resolve(HERE, '..')

// 一个「什么都有」的包：其余规则的静默侧都以它为基准。
function goodDir(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pkg-'))
  const manifest = {
    name: 'dsh-my-plugin',
    version: '0.1.0',
    engines: { node: '>=22.19.0', dsh: '>=0.2.2-rc.1 <0.3.0-0' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    bin: { 'dsh-my-plugin': './bin/cli.js' },
    exports: { '.': './src/index.js', './icon': './icon.svg' },
    files: ['src', 'bin', 'cordis.patch.yml', 'docs', 'icon.svg', 'README.md', 'locale'],
    ...overrides,
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2))
  writeFileSync(join(dir, 'cordis.patch.yml'), "- insert:\n    - id: my-plugin\n      name: 'dsh-my-plugin'\n")
  writeFileSync(join(dir, 'README.md'), '# my plugin\n\n```\ndsh plugin --profile web add dsh-my-plugin\n```\n')
  writeFileSync(join(dir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
  mkdirSync(join(dir, 'locale'))
  writeFileSync(join(dir, 'locale', 'en.json'), '{}')
  mkdirSync(join(dir, 'docs'))
  writeFileSync(join(dir, 'docs', 'DETAIL.md'), '# detail\n')
  mkdirSync(join(dir, 'src'))
  writeFileSync(join(dir, 'src', 'index.js'), '')
  mkdirSync(join(dir, 'bin'))
  writeFileSync(join(dir, 'bin', 'cli.js'), '')
  return dir
}

function withDir(run) {
  const dir = goodDir()
  try {
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const rules = result => result.findings.map(finding => finding.rule)

test('GOOD 包零发现（其余规则的静默侧都基于它）', () => {
  withDir(dir => {
    const result = lintPluginPackage(dir, { dirName: 'dsh-my-plugin' })
    assert.deepEqual(result.findings, [])
    assert.equal(result.checked.package, 'dsh-my-plugin')
  })
})

test('manifest-missing / manifest-unparsable：一个目录不是包的原因要说出来', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pkg-'))
  try {
    assert.deepEqual(rules(lintPluginPackage(dir)), ['manifest-missing'])
    writeFileSync(join(dir, 'package.json'), '{ not json')
    assert.deepEqual(rules(lintPluginPackage(dir)), ['manifest-unparsable'])
    // 静默侧：一个能解析的 package.json 不再报这两条（审计要求每条规则两个方向）。
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-x', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    writeFileSync(join(dir, 'cordis.patch.yml'), "- insert:\n    - id: x\n      name: 'dsh-x'\n")
    const clean = lintPluginPackage(dir).findings.filter(finding => ['manifest-missing', 'manifest-unparsable'].includes(finding.rule))
    assert.deepEqual(clean, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('bundle-missing：只声明 dsh.client 装不上——目录第一号打回理由', () => {
  withDir(dir => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-my-plugin', dsh: { client: { platform: 'web' } } }))
    const result = lintPluginPackage(dir)
    assert.ok(rules(result).includes('bundle-missing'))
    assert.equal(result.ok, false)
  })
})

test('patch-missing / patch-empty：声明了却挂不上', () => {
  withDir(dir => {
    rmSync(join(dir, 'cordis.patch.yml'))
    assert.ok(rules(lintPluginPackage(dir)).includes('patch-missing'))
    writeFileSync(join(dir, 'cordis.patch.yml'), '# nothing here\n')
    assert.ok(rules(lintPluginPackage(dir)).includes('patch-empty'))
  })
})

test('patch-name-mismatch：挂的既不是自己也不是依赖', () => {
  withDir(dir => {
    writeFileSync(join(dir, 'cordis.patch.yml'), "- insert:\n    - id: other\n      name: 'dsh-something-else'\n")
    assert.ok(rules(lintPluginPackage(dir)).includes('patch-name-mismatch'))
  })
})

test('聚合包合法地不挂自己：patch 挂的是声明的依赖', () => {
  withDir(dir => {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    manifest.dependencies = { 'dsh-a-check': '^0.1.0' }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    writeFileSync(join(dir, 'cordis.patch.yml'), "- insert:\n    - id: check-a\n      name: 'dsh-a-check'\n")
    const result = lintPluginPackage(dir)
    assert.ok(!rules(result).includes('patch-name-mismatch'), JSON.stringify(result.findings))
  })
})

test('files-omits-patch / files-omits-detail：声明了 files 却漏掉运行必需的东西', () => {
  withDir(dir => {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    manifest.files = ['src', 'bin']
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    const found = rules(lintPluginPackage(dir))
    assert.ok(found.includes('files-omits-patch'))
    assert.ok(found.includes('files-omits-detail'))
  })
})

test('engines-missing：没写 dsh 版本范围只是 warn', () => {
  withDir(dir => {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    delete manifest.engines
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    const result = lintPluginPackage(dir)
    assert.ok(rules(result).includes('engines-missing'))
    assert.equal(result.ok, true, 'warn 不该把包判成装不上')
  })
})

test('bin-name-mismatch：bin 里没有包名，npx <包名> 就会 404', () => {
  withDir(dir => {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    manifest.bin = { 'my-plugin': './bin/cli.js' }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    const result = lintPluginPackage(dir)
    assert.ok(rules(result).includes('bin-name-mismatch'))
    assert.equal(result.ok, true)
  })
})

test('readme-missing / readme-install-missing：没有 README，或没有安装命令', () => {
  withDir(dir => {
    rmSync(join(dir, 'README.md'))
    assert.ok(rules(lintPluginPackage(dir)).includes('readme-missing'))
    writeFileSync(join(dir, 'README.md'), '# my plugin\n\n很好用。\n')
    assert.ok(rules(lintPluginPackage(dir)).includes('readme-install-missing'))
  })
})

test('locale-missing / icon-missing：插件页会空着', () => {
  withDir(dir => {
    rmSync(join(dir, 'locale'), { recursive: true, force: true })
    rmSync(join(dir, 'icon.svg'))
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    delete manifest.exports['./icon']
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    const found = rules(lintPluginPackage(dir))
    assert.ok(found.includes('locale-missing'))
    assert.ok(found.includes('icon-missing'))
  })
})

test('private：发不到 npm 是 error，措辞不夸大', () => {
  withDir(dir => {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    manifest.private = true
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    const result = lintPluginPackage(dir)
    const finding = result.findings.find(entry => entry.rule === 'private')
    assert.ok(finding && finding.level === 'error')
    assert.match(finding.message, /git|link/, '从 git 或本地 link 装仍然可以，消息不该说「别人装不到」')
  })
})

// 这条闸把本 kit 自己的 30 个包全部跑一遍，要求零发现——包括聚合包 dsh-check-suite。
// 它抓到的第一件事就是套件被 patch-name-mismatch 误报：聚合包合法地不挂自己。
test('本仓库的每个包都必须零发现（含聚合包）', () => {
  const packages = readdirSync(KIT).filter(name => existsSync(join(KIT, name, 'package.json')))
  assert.ok(packages.length >= 30, `只找到 ${packages.length} 个包`)
  const failures = []
  for (const name of packages) {
    const result = lintPluginPackage(join(KIT, name), { dirName: name })
    for (const finding of result.findings) failures.push(`${name}: ${finding.level} ${finding.rule} — ${finding.message}`)
  }
  assert.deepEqual(failures, [], failures.join('\n'))
})

test('CLI 与函数同一份实现，出口码按 errors', () => {
  withDir(dir => {
    const direct = lintPluginPackage(dir, { dirName: 'dsh-my-plugin' })
    const printed = execFileSync(process.execPath, [resolve(HERE, 'bin', 'cli.js'), dir, '--json'], { encoding: 'utf8' })
    assert.deepEqual(JSON.parse(printed), direct)
  })
})

test('README 里那条命令真的能跑（陌生人路径）', () => {
  const readme = readFileSync(join(HERE, 'README.md'), 'utf8')
  const command = readme.match(/npx\s+(dsh-plugin-package-check)\s+(\S+)/)
  assert.ok(command, 'README 没有给出 npx 命令')
  assert.equal(command[1], 'dsh-plugin-package-check')
})

// checked.rules 必须是推导值，而且跑出来的每条规则都得在这张清单里——手写的数字与漏登记的
// 规则是同一种谎：一个说「我查了 14 条」，另一个实际会报第 15 条。
test('规则清单是单一事实：跑出来的规则都在 RULES 里，且没有重复', () => {
  assert.equal(new Set(RULES).size, RULES.length, 'RULES 里有重复')
  const seen = new Set()
  const dir = goodDir()
  try {
    const base = lintPluginPackage(dir)
    for (const finding of base.findings) seen.add(finding.rule)
    // 把每个 error 侧都弄坏一遍，收集实际会报的规则名
    const breakers = [
      [() => rmSync(join(dir, 'cordis.patch.yml')), 'patch-missing'],
      [() => writeFileSync(join(dir, 'cordis.patch.yml'), ''), 'patch-empty'],
    ]
    for (const [breakIt, rule] of breakers) {
      breakIt()
      for (const finding of lintPluginPackage(dir).findings) seen.add(finding.rule)
      assert.ok(seen.has(rule), `弄坏之后应当报 ${rule}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  for (const rule of seen) assert.ok(RULES.includes(rule), `报了没登记的规则：${rule}`)
})
