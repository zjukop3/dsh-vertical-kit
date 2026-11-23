import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

// 每个包的 CLI 都会打一行 summary。这条闸只问一件事：那行里不许出现 undefined。
//
// 已经发生过两次：handover 的会话交接分支、resume 的续点分支，都是早退分支的
// checked 少了字段，而单测只断言 findings，于是本地全绿、发布产物上却印着
// 「ok: undefined items」。发布产物才是别人看得见的东西。
const ROOT = resolve(import.meta.dirname, '..')
const FIXTURE = `# 示例文档\n\n2026-11-20\n\n- 一条\n- 两条\n\n## 说明\n\n正文。\n`

test('每个包的 CLI 都不会打出 undefined', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cli-'))
  const file = join(dir, 'sample.md')
  writeFileSync(file, FIXTURE)
  const failures = []
  try {
    for (const name of readdirSync(resolve(ROOT, 'packages'))) {
      const cli = resolve(ROOT, 'packages', name, 'bin', 'cli.js')
      if (!existsSync(cli)) continue
      let stdout = ''
      try {
        stdout = execFileSync(process.execPath, [cli, file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (error) {
        // 出口码 1/2 是正常结果（有发现 / 用法不对），stdout 仍要看。
        stdout = String(error.stdout ?? '')
        if (!stdout) continue // 这个包不接受这份 fixture，跳过而不是误判
      }
      if (/undefined/.test(stdout)) failures.push(`${name}: ${stdout.split('\n').filter(l => /undefined/.test(l)).join(' | ')}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  assert.deepEqual(failures, [], `这些包的 CLI 打出了 undefined：\n${failures.join('\n')}`)
})
