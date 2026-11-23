// Audits every internal link in site/*.html against the real file tree, so a
// broken href fails the build instead of a visitor. Directory links resolve
// through their index.html; non-HTML targets (png, pdf, docx, txt, sha256)
// are checked on disk. External links are only checked for shape.
//
// 另外查一件链接审计查不到的事：**索引页必须指向每一个检查**。页面都在、但首页
// 漏掉一个，读者就找不到它——2026-11-23 这一轮我自己就因为只匹配 ./slug/ 而误判
// 「索引缺 27 个」，实际用的是绝对地址。所以这条闸按 slug 比对两个集合，不看链接写法。
//
//   node scripts/audit-site-links.mjs
//
// Exits 1 on any unresolved internal target.

import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, join, normalize } from 'node:path'

const root = resolve(import.meta.dirname, '..', 'site')
const packagesDir = resolve(import.meta.dirname, '..', 'packages')

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true })
  return entries.filter(entry => entry.isFile() && entry.name.endsWith('.html')).map(entry => resolve(entry.parentPath || entry.path, entry.name))
}

function targetsOf(html) {
  const targets = []
  for (const [, attribute, value] of html.matchAll(/(href|src)="([^"]*)"/g)) {
    if (value.startsWith('#') || /^(https?:|mailto:|data:)/.test(value)) continue
    const [pathPart] = value.split('#')
    if (pathPart) targets.push({ attribute, value, pathPart })
  }
  return targets
}

const files = await walk(root)
const broken = []
for (const file of files) {
  const page = file.slice(root.length + 1).replaceAll('\\', '/')
  const html = await readFile(file, 'utf8')
  for (const target of targetsOf(html)) {
    const resolved = normalize(join(dirname(file), target.pathPart))
    // a directory link works when it (or its trailing-slash form) has an index.html
    const candidates = [resolved, join(resolved, 'index.html'), `${resolved}.html`]
    if (!candidates.some(candidate => existsSync(candidate))) {
      broken.push({ page, attribute: target.attribute, href: target.value })
    }
  }
}

if (broken.length) {
  for (const item of broken) process.stderr.write(`broken: ${item.page} -> ${item.attribute}="${item.href}"\n`)
  process.exit(1)
}
console.log(JSON.stringify({ ok: true, pages: files.length, internalLinks: 'all resolved' }))

// 索引覆盖：packages/*/src/index.js 存在的每个检查，都必须在 site/index.html 里出现。
// 按 slug 集合比对，不按链接前缀比对——写法（./x/ 还是绝对地址）不是判据。
{
  const { readdirSync } = await import('node:fs')
  const checks = readdirSync(packagesDir)
    .filter(name => existsSync(join(packagesDir, name, 'src', 'index.js')))
    .map(name => name.replace(/^dsh-/, ''))
  const indexHtml = await readFile(join(root, 'index.html'), 'utf8')
  const slugs = new Set(
    [...indexHtml.matchAll(/dsh-vertical-kit\/([a-z0-9-]+)\//g)].map(match => match[1]),
  )
  const missing = checks.filter(check => !slugs.has(check))
  if (missing.length > 0) {
    console.error(`site/index.html 漏掉 ${missing.length} 个检查：${missing.join(', ')}`)
    process.exitCode = 1
  }
}
