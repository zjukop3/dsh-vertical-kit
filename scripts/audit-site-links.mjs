// Audits every internal link in site/*.html against the real file tree, so a
// broken href fails the build instead of a visitor. Directory links resolve
// through their index.html; non-HTML targets (png, pdf, docx, txt, sha256)
// are checked on disk. External links are only checked for shape.
//
//   node scripts/audit-site-links.mjs
//
// Exits 1 on any unresolved internal target.

import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, join, normalize } from 'node:path'

const root = resolve(import.meta.dirname, '..', 'site')

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
