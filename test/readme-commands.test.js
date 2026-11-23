import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync, statSync, constants, accessSync } from 'node:fs'
import { resolve, join } from 'node:path'

// 「陌生人路径」闸：README 里让用户敲的第一条命令，必须真的能解析。
//
// 2026-11-23 的教训：27 个包的 README 都写 `npx commit-msg-check …`，而 npx 会把第一段
// 当成**包名**去 registry 找——那个包不存在，于是 404。所有包的首跑都是死的，而测试全绿，
// 因为我只测了函数，从没测过用户最先敲的那一行。
//
// 这条闸不联网：它断言的是解析的前提——README 里 `npx X` 的 X 必须是这个包 bin 里的一个键，
// 且那个键指向的文件真实存在且可执行。真正的 `npx X` 联网跑一遍属于抽查，不是每轮的闸。
const ROOT = resolve(import.meta.dirname, '..')

function packages() {
  return readdirSync(join(ROOT, 'packages'))
    .filter(name => existsSync(join(ROOT, 'packages', name, 'package.json')))
    .map(name => ({ name, dir: join(ROOT, 'packages', name) }))
}

/** 把 markdown 拆成代码块（逐行扫描）。用正则配 ``` 会被相邻代码块骗到——
 *  一份 README 里 ```markdown 与 ```text 紧挨着时，非贪婪匹配会把配对搞错。 */
export function fencedBlocks(readme) {
  const blocks = []
  let current = null
  for (const line of String(readme).split('\n')) {
    if (/^\s*```/.test(line)) {
      if (current === null) current = { info: line.trim().slice(3).trim(), lines: [] }
      else {
        blocks.push(current)
        current = null
      }
      continue
    }
    if (current) current.lines.push(line)
  }
  return blocks
}

/** README 里第一条 `npx <pkg> …` 出现的包名（只看代码块，且只认 bash 系）。 */
export function firstNpxTarget(readme) {
  for (const block of fencedBlocks(readme)) {
    if (!/^(?:bash|sh|shell|console)?$/.test(block.info)) continue
    for (const line of block.lines) {
      const match = line.match(/^\s*(?:\$\s*)?npx\s+(?:--?[\w-]+\s+)*(@?[\w./-]+)/)
      if (match) return match[1]
    }
  }
  return null
}

test('README 里第一条 npx 命令指向的是本包的一个 bin 键', () => {
  const failures = []
  for (const { name, dir } of packages()) {
    const readmePath = join(dir, 'README.md')
    if (!existsSync(readmePath)) continue
    const target = firstNpxTarget(readFileSync(readmePath, 'utf8'))
    if (!target) continue // 这个包的 README 不推荐 npx，跳过
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    // 判据必须是「等于包名」，不是「是某个 bin 键」：`npx adr-check` 里的 adr-check
    // 确实是这个包的 bin 键，但 npx 会拿它当**包名**去 registry 找，照样 404。
    // 第一版闸就写成「是某个 bin 键」，反向验证时立刻暴露：改坏 README 它还是绿的。
    if (target !== manifest.name) {
      failures.push(`${name}: README 写 npx ${target}，必须写包名 ${manifest.name}，否则 npx 会去 registry 找同名包并 404`)
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'))
})

test('每个 bin 键指向的文件存在且可执行', () => {
  const failures = []
  for (const { name, dir } of packages()) {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    for (const [key, relative] of Object.entries(manifest.bin ?? {})) {
      const file = resolve(dir, relative)
      if (!existsSync(file)) {
        failures.push(`${name}: bin[${key}] → ${relative} 不存在`)
        continue
      }
      if (!statSync(file).isFile()) failures.push(`${name}: bin[${key}] → ${relative} 不是文件`)
      try {
        accessSync(file, constants.X_OK)
      } catch {
        failures.push(`${name}: bin[${key}] → ${relative} 没有可执行位（npm 会静默丢掉它）`)
      }
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'))
})

test('每个有 CLI 的包都给出了至少一条 npx 命令（没有就说明我们没教人怎么跑）', () => {
  const silent = packages().filter(({ dir }) => {
    const readmePath = join(dir, 'README.md')
    if (!existsSync(readmePath)) return false
    // 没有 bin 的包是 bundle（例如 dsh-check-suite），它的入口是 dsh plugin add，不是 npx。
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    if (!manifest.bin || Object.keys(manifest.bin).length === 0) return false
    return firstNpxTarget(readFileSync(readmePath, 'utf8')) === null
  })
  assert.deepEqual(silent.map(p => p.name), [], `这些包的 README 没有 npx 命令：${silent.map(p => p.name).join(', ')}`)
})