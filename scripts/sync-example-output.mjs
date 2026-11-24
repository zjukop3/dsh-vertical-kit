#!/usr/bin/env node
// 用真实运行结果刷新 checks-data.mjs 里每个条目的 example.output。
//
// 为什么要脚本：这些输出被 README 与站点逐字展示，也是「工具真的会这么说」的证据。
// 手改一次就出错一次——第一次手改把 JSON 字符串里的换行写成了真换行，文件直接语法
// 错误。这里改成按行替换：定位 `npm: "<name>"` 之后第一行以 `"output":` 开头的
// 行，整行用 JSON.stringify 写回，不碰别的字节。
//
// 用法：node scripts/sync-example-output.mjs [--check]
//   --check 只比较不写入，有差异退出 1。
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync as writeTmp, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { CHECKS } from './checks-data.mjs'

const root = resolve(import.meta.dirname, '..')
const dataPath = resolve(root, 'scripts/checks-data.mjs')

/** 跑一次 CLI，返回它真实打印的东西（不含 `$ …` 那行）。 */
export function runExample(check) {
  // 输入是目录的检查（plugin-package-check）：照命令里的路径直接跑，不往临时目录写文件。
  if (check.example.fixture === null || check.example.fixture === undefined) {
    const target = (check.example.command.match(/(\.\/\S+|\/\S+)/) || [])[1]
    if (!target) throw new Error(`${check.npm}: fixture 为 null 时命令里必须带一个路径`)
    const stdout = execFileSync(process.execPath, [resolve(root, 'packages', check.npm, 'bin', 'cli.js'), target], {
      encoding: 'utf8',
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return stdout.trimEnd()
  }
  const dir = mkdtempSync(join(tmpdir(), 'dsh-example-'))
  const fileName = (check.example.command.match(/(\S+\.(?:md|txt|json|yml))/) || [])[1] || 'sample.md'
  const file = join(dir, fileName)
  writeTmp(file, check.example.fixture)
  try {
    const stdout = execFileSync(
      process.execPath,
      [resolve(root, 'packages', check.npm, 'bin', 'cli.js'), file],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return stdout.trimEnd()
  } catch (error) {
    // 出口码 1 是「有发现」，CLI 仍然打印了结果，stdout 就在 error.stdout 里。
    if (typeof error.stdout === 'string' && error.stdout.trim()) return error.stdout.trimEnd()
    throw new Error(`${check.npm}: CLI failed — ${String(error.stderr || error.message).split('\n')[0]}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** 期望的输出行：`$ <command>` 加真实 stdout。 */
export function expectedOutput(check) {
  return `$ ${check.example.command}\n${runExample(check)}`
}

/** 逐行替换每条目的 output 行；返回新文本。 */
export function rewrite(text, checks = CHECKS) {
  const lines = text.split('\n')
  for (const check of checks) {
    // 老条目用单引号、新条目用双引号，两种都要认；比的是引号里的值。
    const anchor = lines.findIndex(line => {
      const m = line.match(/^\s*npm:\s*['"]([^'"]+)['"],?\s*$/)
      return m && m[1] === check.npm
    })
    if (anchor === -1) throw new Error(`${check.npm}: npm 行没找到`)
    // 两种形状都要认：output 单独一行，或整个 example 挤在一行里。
    const body = JSON.stringify(expectedOutput(check))
    const onOwnLine = lines.findIndex((line, index) => index > anchor && /^\s*["']?output["']?:/.test(line))
    if (onOwnLine !== -1) {
      lines[onOwnLine] = `      "output": ${body},`
    } else {
      // 单行对象：只替换那一个 JSON 字符串，用能跳过转义引号的模式，
      // 不跨行、不碰别的字节。
      const inline = lines.findIndex((line, index) => index > anchor && /"output":\s*"/.test(line))
      if (inline === -1) throw new Error(`${check.npm}: output 没找到`)
      lines[inline] = lines[inline].replace(/"output":\s*"(?:[^"\\]|\\.)*"/, `"output": ${body}`)
    }
  }
  return lines.join('\n')
}

function main() {
  const check = process.argv.includes('--check')
  const current = readFileSync(dataPath, 'utf8')
  const nextText = rewrite(current)
  const next = nextText
  if (current === next) {
    console.log('示例输出与真实运行一致')
    return
  }
  if (check) {
    // 逐条比对「当前这一行的值」与「真实运行的值」，而不是在整份文件里找子串——
    // 找子串的写法在输出被截断或转义不同的时候会说谎。
    const diff = current.split('\n').filter((line, index, all) => {
      const next = nextText.split('\n')[index]
      return line !== next
    })
    console.log(`${diff.length} 行与真实运行不一致`)
    const anchors = current.split('\n')
    for (const check2 of CHECKS) {
      const at = anchors.findIndex(l => {
        const m = l.match(/^\s*npm:\s*['"]([^'"]+)['"],?\s*$/)
        return m && m[1] === check2.npm
      })
      if (at === -1) continue
      const end = anchors.findIndex((l, i) => i > at && /output/.test(l))
      if (end !== -1 && anchors[end] !== nextText.split('\n')[end]) console.log(`DRIFT ${check2.npm}`)
    }
    process.exitCode = 1
    return
  }
  writeFileSync(dataPath, next)
  console.log(`刷新 ${CHECKS.length} 个条目的示例输出`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()