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
    if (check.example.fixture === null || check.example.fixture === undefined) {
      // 目录型输入：照命令里的路径直接跑（见 checks-data 里那条 example 的注释）。
      const target = (check.example.command.match(/(\.\/\S+|\/\S+)/) || [])[1]
      const run = spawnSync(process.execPath, [cli, target], { encoding: 'utf8', cwd: root })
      const actual = `${run.stdout}${run.stderr}`.trim().split('\n').map(line => line.trim())
      const embedded = check.example.output.split('\n').filter(line => line && !line.startsWith('$') && !line.startsWith('# '))
      for (const line of embedded) {
        assert.ok(actual.includes(line.trim()), `${check.slug}: embedded line not produced by the CLI\n  embedded: ${line}\n  actual: ${actual.join(' | ')}`)
      }
      continue
    }
    // 文件名必须与示例里那条命令写的一致：有些检查看文件扩展名（plugin-entry-check 只对
    // .yml 说文件名的事），用自己拼的 `<slug>-input.md` 会得到与 sync-example-output 不同的
    // 结果——两条闸各自绿着，而它们测的不是同一件事。
    const fromCommand = (check.example.command.match(/(\S+\.(?:md|txt|json|yml|csv))/g) || []).pop()
    const fileName = fromCommand
      ? fromCommand.split('/').pop()
      : `${check.slug}-input${check.slug === 'listing-check' ? '.csv' : check.slug === 'invoice-check' ? '.txt' : '.md'}`
    const target = join(directory, fileName)
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
