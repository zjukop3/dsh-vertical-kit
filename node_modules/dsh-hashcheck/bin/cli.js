#!/usr/bin/env node
// Two verbs, both deterministic: build writes a manifest, verify compares one.
// Exit codes: 0 clean, 1 findings, 2 usage or read error.

import { readFile, writeFile } from 'node:fs/promises'
import { buildManifest, serializeManifest, verifyManifest } from '../src/index.js'

const args = process.argv.slice(2)
const command = args[0]
const target = args[1]

function usage(message) {
  if (message) process.stderr.write(`${message}\n`)
  process.stderr.write([
    'usage:',
    '  dsh-hashcheck build <directory> [--out hashcheck.json] [--ignore node_modules]',
    '  dsh-hashcheck verify <hashcheck.json> [--dir <directory>] [--quiet]',
    '',
  ].join('\n'))
  process.exit(2)
}

function option(name, fallback) {
  const at = args.indexOf(name)
  return at === -1 ? fallback : args[at + 1]
}

if (!command || !['build', 'verify'].includes(command)) usage()
if (!target) usage(`${command} needs a path`)

const ignores = args.reduce((list, value, index) => (args[index - 1] === '--ignore' ? [...list, value] : list), [])

try {
  if (command === 'build') {
    const manifest = await buildManifest(target, { ignore: ignores })
    const out = option('--out', `${target.replace(/\/$/, '')}/hashcheck.json`)
    await writeFile(out, serializeManifest(manifest))
    const count = Object.keys(manifest.files).length
    process.stdout.write(`${out}: ${count} file${count === 1 ? '' : 's'}, sha256\n`)
    process.exit(0)
  }

  const manifest = JSON.parse(await readFile(target, 'utf8'))
  const directory = option('--dir', target.includes('/') ? target.slice(0, target.lastIndexOf('/')) || '.' : '.')
  const result = await verifyManifest(manifest, directory, { reportExtra: !args.includes('--no-extra') })
  if (!args.includes('--quiet')) {
    for (const finding of result.findings) process.stdout.write(`${finding.level} ${finding.rule} ${finding.message}\n`)
  }
  process.stdout.write(`${result.ok ? 'ok' : 'fail'}: ${result.checked} checked, ${result.errors} errors, ${result.warnings} warnings\n`)
  process.exit(result.ok ? 0 : 1)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}
