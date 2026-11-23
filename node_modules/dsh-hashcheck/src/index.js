// A manifest says what the delivered bytes were; verification says whether they
// still are. Everything here is deterministic: no timestamps inside the digest,
// no dependency on mtime, so the same tree hashes the same on any machine.

import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
export const packageVersion = require('../package.json').version

export const name = 'hashcheck'
export const inject = ['webServer']

export const MANIFEST_VERSION = 1

export function digestOf(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

// Directory order is not stable across filesystems, so the manifest is written
// in sorted path order and with forward slashes: the file is meant to be diffed.
export function normalizePath(path) {
  return path.split(sep).join('/')
}

export async function listFiles(directory, { ignore = [], recursive = true } = {}) {
  const found = []
  const walk = async current => {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(current, entry.name)
      const path = normalizePath(relative(directory, full))
      if (ignore.some(pattern => path === pattern || path.startsWith(`${pattern}/`))) continue
      if (entry.isDirectory()) {
        if (recursive) await walk(full)
        continue
      }
      if (entry.isFile()) found.push(path)
    }
  }
  await walk(directory)
  return found.sort()
}

export async function buildManifest(directory, options = {}) {
  const files = await listFiles(directory, options)
  const entries = {}
  for (const path of files) {
    const full = join(directory, path)
    const [bytes, info] = await Promise.all([readFile(full), stat(full)])
    entries[path] = { size: info.size, sha256: digestOf(bytes) }
  }
  return {
    version: MANIFEST_VERSION,
    algorithm: 'sha256',
    // The ignore list travels with the manifest: a verify that does not know
    // what was excluded would report every excluded file as unlisted.
    ignore: [...(options.ignore || [])].sort(),
    files: entries,
    packageVersion,
  }
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

// Comparison reports the three states that matter: a file in the manifest that
// is gone, a file whose bytes changed, and a file delivered but never listed.
// The third one is the one people forget to check.
export async function verifyManifest(manifest, directory, { reportExtra = true, ignore } = {}) {
  const findings = []
  const listed = Object.keys(manifest.files || {}).sort()
  for (const path of listed) {
    const expected = manifest.files[path]
    let bytes
    try {
      bytes = await readFile(join(directory, path))
    } catch (error) {
      if (error.code === 'ENOENT') {
        findings.push({ level: 'error', rule: 'missing', path, message: `${path} is in the manifest and not on disk` })
        continue
      }
      throw error
    }
    const actual = digestOf(bytes)
    if (actual !== expected.sha256) {
      findings.push({
        level: 'error',
        rule: 'changed',
        path,
        expected: expected.sha256,
        actual,
        message: `${path} changed: expected ${expected.sha256.slice(0, 12)}…, found ${actual.slice(0, 12)}…`,
      })
    } else if (bytes.length !== expected.size) {
      findings.push({
        level: 'warn',
        rule: 'size-mismatch',
        path,
        message: `${path} hashes the same but the manifest records ${expected.size} bytes and the file has ${bytes.length}`,
      })
    }
  }
  if (reportExtra) {
    const present = await listFiles(directory, { ignore: ignore ?? manifest.ignore ?? [] })
    const extra = present.filter(path => !(path in (manifest.files || {})))
    for (const path of extra) {
      findings.push({ level: 'warn', rule: 'unlisted', path, message: `${path} is on disk but not in the manifest` })
    }
  }
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, checked: listed.length, errors, warnings: findings.length - errors, findings, packageVersion }
}

// The host route is a thin wrapper: the CLI and the route call the same
// functions, so a check that passes in CI cannot fail in the panel.
export function apply(ctx, config = {}) {
  const prefix = config.path || '/hashcheck/api'
  const handler = async (req, res) => {
    const send = (status, body) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }
    try {
      if (req.method !== 'POST') return send(405, { error: 'POST only' })
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      if (body.action === 'build') {
        const manifest = await buildManifest(String(body.directory || '.'), { ignore: body.ignore || [] })
        return send(200, { manifest, serialized: serializeManifest(manifest) })
      }
      if (body.action === 'verify') {
        if (!body.manifest || typeof body.manifest !== 'object') return send(400, { error: 'manifest is required' })
        return send(200, await verifyManifest(body.manifest, String(body.directory || '.')))
      }
      return send(400, { error: 'action must be build or verify' })
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
  ctx.effect(() => ctx.logger.info(`hashcheck ${packageVersion} loaded`))
}
