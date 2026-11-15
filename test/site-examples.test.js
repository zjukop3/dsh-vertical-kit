// The examples embedded in the site pages must be what the tools actually
// print. This re-runs every example through the real CLI and compares.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { CHECKS } from '../scripts/checks-data.mjs'

const root = resolve(import.meta.dirname, '..')

test('every embedded scenario example matches a fresh CLI run', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vertical-kit-examples-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const check of CHECKS) {
    assert.ok(check.example, `${check.slug} has an example`)
    const cli = resolve(root, 'packages', check.npm, 'bin', 'cli.js')
    const target = join(directory, `${check.slug}-input${check.slug === 'listing-check' ? '.csv' : check.slug === 'invoice-check' ? '.txt' : '.md'}`)
    await writeFile(target, check.example.fixture.replace(/\\n/g, '\n'))
    const run = spawnSync(process.execPath, [cli, target], { encoding: 'utf8' })
    const actual = `${run.stdout}${run.stderr}`.trim().split('\n').map(line => line.trim())
    const embedded = check.example.output.split('\n').filter(line => line && !line.startsWith('$') && !line.startsWith('# '))
    for (const line of embedded) {
      assert.ok(actual.includes(line.trim()),
        `${check.slug}: embedded line not produced by the CLI\n  embedded: ${line}\n  actual:   ${actual.join(' | ')}`)
    }
  }
})
