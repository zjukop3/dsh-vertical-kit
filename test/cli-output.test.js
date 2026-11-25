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
// 一份通用文档不够：这个闸上线当天就漏了一次——test-report-check 的性能报告分支
// 打印 undefined，而闸只喂了通用 markdown，没走到那条早退分支。所以喂一组 fixture，
// 专挑能触发「另一个文体」早退的：性能报告、会话交接、续点、指路型贡献指南。
const FIXTURES = {
  generic: `# 示例文档\n\n2026-11-20\n\n- 一条\n- 两条\n\n## 说明\n\n正文。\n`,
  perf: `# 压测报告\n\n20 并发 × 6 轮\n\n| 配置 | p50 | p95 |\n|---|---|---|\n| 优化后 | 0.338s | 0.587s |\n`,
  sessionHandover: `# Handover — Session 2026-03-03\n\n## Current State\n\n好。\n\n## Files Changed\n\n- a.js\n`,
  checkpoint: `# Session resume state — branch codex/x\n\n## checkpoint\n\n- 修了解析器\n`,
  pointerGuide: `# Contributing\n\nRead the [Contributor's Guide](https://example.com/community/contributors/guide/).\n`,
  // 社区周报 / 渗透测试报告 / 「不是测试报告」这三种早退分支都是这一轮才加的：
  // 每加一个分支就会有新的 checked 形状，闸必须跟着喂到。
  communityWeekly: `---\ntitle: Weekly Report (Aug 23 - Aug 29)\ntags: [Community]\n---\n\n## Introduction\n\nCommunity weekly.\n\n## Contributor statistics\n\nNew contributors: 4.\n\n## Upcoming\n\nNext week: v3.2.\n`,
  pentest: `# Web 渗透测试报告\n\n## 范围\n\nexample.com\n\n## 方法\n\nnmap\n\n## 发现\n\n严重：SQL 注入\n\n## 修复建议\n\n参数化查询\n`,
  notTestReport: `# Latest Sync Report\n\n同步了 12 条记录。\n`,
}

test('每个包的 CLI 在任何 fixture 下都不会打出 undefined', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cli-'))
  const failures = []
  try {
    for (const [kind, body] of Object.entries(FIXTURES)) {
      const file = join(dir, `${kind}.md`)
      writeFileSync(file, body)
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
        // undefined 与裸 null 是同一类丑：把内部字段的缺失漏到发布产物上。
        const ugly = /undefined|: null,|, null,/.test(stdout)
        if (ugly) failures.push(`${name} [${kind}]: ${stdout.split('\n').filter(l => /undefined|null/.test(l)).join(' | ')}`)
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  assert.deepEqual(failures, [], `这些包的 CLI 打出了 undefined：\n${failures.join('\n')}`)
})
