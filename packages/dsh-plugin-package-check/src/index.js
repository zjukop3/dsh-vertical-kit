// 一个 DSH 插件包「装得上、找得到」吗——只看包目录本身。
//
// 为什么值得单独一个检查：目录收录门槛里最常被打回的一条是 package.json 没声明
// `dsh.bundle`（那样 `dsh plugin add` 装不上）；而另一类错误更隐蔽——声明了、patch 文件也
// 在，但 files 数组没把它打进 tarball，于是本地能跑、发出去装不上。
//
// 十条规则全部在磁盘上可判定：不联网、不执行包代码、不读 registry。校准语料是这台机器上
// 已经装着的六个第三方插件（别人的包）加上本仓库自己的三十个包——别人的包不是摆设：
// dsh-purge-community 的 bin 键里没有它自己的包名，所以 README 让人敲 `npx dsh-purge-community`
// 会 404；这正是我在自己 27 个包上犯过的同一个错。

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const IMAGE = /\.(svg|png|jpe?g|webp)$/i

/** 规则清单：checked.rules 由它推出，测试断言「跑出来的规则都在这里」——数字不能是手写的。 */
export const RULES = [
  'manifest-missing', 'manifest-unparsable', 'private',
  'bundle-missing', 'patch-missing', 'patch-empty', 'patch-name-mismatch',
  'files-omits-patch', 'files-omits-detail', 'engines-missing', 'bin-name-mismatch',
  'readme-missing', 'readme-install-missing', 'locale-missing', 'icon-missing',
]

/** 从 package.json 与目录结构判定。dir 是一个已安装或已打包的插件包目录。 */
export function lintPluginPackage(dir, options = {}) {
  const findings = []
  const add = (level, rule, message) => findings.push({ level, rule, line: 0, message })
  const read = (name) => {
    const path = join(dir, name)
    return existsSync(path) ? readFileSync(path, 'utf8') : null
  }

  const manifestText = read('package.json')
  if (!manifestText) {
    add('error', 'manifest-missing', '目录里没有 package.json——这不是一个包')
    return finish(findings, {})
  }
  let manifest
  try {
    manifest = JSON.parse(manifestText)
  } catch (error) {
    add('error', 'manifest-unparsable', `package.json 不是合法 JSON：${String(error.message).slice(0, 80)}`)
    return finish(findings, {})
  }
  if (manifest.private) add('error', 'private', 'package.json 标了 private——发不到 npm（从 git 或本地 link 装仍然可以）')

  const bundle = manifest.dsh?.bundle
  if (!bundle || typeof bundle !== 'object' || !bundle.patch) {
    // 这是目录收录的第一号打回理由：只有 dsh.client 是不够的，那样 dsh plugin add 装不上。
    add('error', 'bundle-missing', 'dsh.bundle.patch 没声明——`dsh plugin add` 装不上，目录也不会收')
  } else {
    const patchPath = join(dir, bundle.patch)
    if (!existsSync(patchPath)) {
      add('error', 'patch-missing', `dsh.bundle.patch 指向 ${bundle.patch}，但目录里没有这个文件`)
    } else {
      const patch = readFileSync(patchPath, 'utf8')
      const names = [...patch.matchAll(/name:\s*['"]?([^'"\n]+?)['"]?\s*$/gm)].map(match => match[1].trim())
      // 聚合包合法地「不挂自己」：dsh-check-suite 的 patch 挂的是它的依赖们。所以判据是
      // 「挂的东西要么是自己，要么是自己声明的依赖」——第一版只认自己，把套件判成了错。
      const deps = new Set(Object.keys(manifest.dependencies ?? {}))
      if (names.length === 0) add('error', 'patch-empty', `${bundle.patch} 里没有任何 insert 行——这一层什么也不挂`)
      else if (!names.includes(manifest.name) && !names.some(entry => deps.has(entry))) {
        add('error', 'patch-name-mismatch', `${bundle.patch} 挂的是 ${names.slice(0, 3).join(' / ')}，既不是本包的 ${manifest.name}，也不是它声明的依赖`)
      }
    }
  }

  // files 白名单：声明了就不该漏掉运行必需的东西。漏了本地照样跑，发出去才坏。
  const files = Array.isArray(manifest.files) ? manifest.files : null
  const inFiles = (target) => !files || files.some(entry => target === entry || target.startsWith(`${entry.replace(/\/$/, '')}/`))
  if (files && bundle?.patch && !inFiles(bundle.patch.replace(/^\.\//, ''))) {
    add('warn', 'files-omits-patch', `files 里没有 ${bundle.patch}——发出去的 tarball 里没有它，装的时候解析不到`)
  }
  if (files && existsSync(join(dir, 'docs/DETAIL.md')) && !inFiles('docs/DETAIL.md')) {
    add('warn', 'files-omits-detail', 'files 里没有 docs/DETAIL.md——插件详情页会空着')
  }

  if (!manifest.engines?.dsh) add('warn', 'engines-missing', 'engines.dsh 没写——读者无从判断这个包跟自己的 DSH 版本兼不兼容')

  const bin = manifest.bin && typeof manifest.bin === 'object' ? Object.keys(manifest.bin) : []
  if (bin.length > 0 && !bin.includes(manifest.name)) {
    // npx 拿第一段当**包名**去 registry 找，所以 bin 键必须有一个等于包名，否则
    // `npx <包名>` 404——我在自己 27 个包上正是这么错的。
    add('warn', 'bin-name-mismatch', `bin 键是 ${bin.join(' / ')}，没有一个是包名——\`npx ${manifest.name}\` 会 404`)
  }

  const readme = read('README.md')
  if (!readme) add('warn', 'readme-missing', '没有 README.md——目录页与 npm 页都没有可读的第一屏')
  else if (!/dsh plugin\s+(--profile\s+\S+\s+)?add/.test(readme)) {
    add('warn', 'readme-install-missing', 'README 里没有一条 `dsh plugin add …` 安装命令——读者得自己猜怎么装')
  }

  if (!existsSync(join(dir, 'locale'))) add('warn', 'locale-missing', '没有 locale/——插件页只能显示包名，没有标题与说明')
  const iconExported = manifest.exports && Object.keys(manifest.exports).includes('./icon')
  const iconFile = [...(manifest.files ?? []), 'icon.svg', 'icon.png'].find(name => IMAGE.test(name) && existsSync(join(dir, name)))
  if (!iconExported && !iconFile) add('warn', 'icon-missing', '没有图标（./icon 导出或 icon.svg）——插件卡片是空白的')

  return finish(findings, { name: manifest.name, version: manifest.version })
}

function finish(findings, meta) {
  const errors = findings.filter(finding => finding.level === 'error').length
  const warnings = findings.filter(finding => finding.level === 'warn').length
  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.rule.localeCompare(b.rule))
  return {
    ok: errors === 0,
    errors,
    warnings,
    findings,
    checked: { package: meta.name ?? null, version: meta.version ?? null, rules: RULES.length },
  }
}

export const name = 'plugin-package-check'
export const inject = ['webServer']

export function apply(ctx, config = {}) {
  const prefix = config.path || '/plugin-package-check/api'
  const handler = async (req, res) => {
    const reply = (status, body) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }
    try {
      if (req.method !== 'POST') return reply(405, { error: 'POST only' })
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      const dir = typeof body.path === 'string' ? body.path : ''
      if (!dir) return reply(400, { error: 'path is required: the package directory' })
      if (!existsSync(dir) || !statSync(dir).isDirectory()) return reply(400, { error: `not a directory: ${dir}` })
      return reply(200, lintPluginPackage(dir, { dirName: body.dirName }))
    } catch (error) {
      return reply(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}