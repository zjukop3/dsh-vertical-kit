#!/usr/bin/env node
// 两条「英文分词假设」的静态闸——它们在本仓库各咬了三次以上。
//
// ① `\b` 紧挨汉字：JS 的 `\b` 是 ASCII word 边界，汉字不是 word 字符，所以
//    `(?:教育|education)\b` 里那个 `\b` 对中文分支永远不成立。表现是「整条规则静默失效」，
//    测试全绿，直到拿真实文档跑一遍。
// ② 行首锚点 `^` 用在**整篇文档**上却没带 `m`：`/^#\s+\S/.test(source)` 在带 frontmatter
//    的文档上永远不匹配——第一行是 `---`，H1 在第五行。resume、spec-doc、migration-guide、
//    privacy-notice 四处都这样错过。
//
// ②的判据要能区分「故意逐行测」：把 `'\n' + line` 喂给 `/^#/` 是本仓库的常见写法，完全正确。
// 所以只看同一行里的 `.test(...)` / `.exec(...)` 参数——参数提到 text/source/doc/String( 才算
// 整篇文档，提到 line 就不算。误报比漏报更糟：一条会喊狼的闸最后会被关掉。
//
// 用法：
//   node scripts/audit-regex-assumptions.mjs          报告并退出 1（有命中）
//   node scripts/audit-regex-assumptions.mjs --json   机器可读
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const CJK = '\\u4e00-\\u9fff'
const LITERAL = /\/(?:\\.|\[(?:\\.|[^\]])*\]|[^/\\\n])+\/([gimsuy]*)/g

/** 一条正则字面量里 \b 落在汉字分支上：对中文那一支永远不成立。
 *
 *  判据不是「\b 紧挨一个汉字字符」——真实写法是 `(?:教育|education)\b`，那个 `\b` 跟在 `)` 后面，
 *  紧挨它的不是汉字，但对中文分支同样不成立。所以看三件事：
 *    · 字面量里有没有汉字（或 `\u4e00-\u9fff` 这种显式区间）；
 *    · 每个 `\b` 左边是不是「ASCII 字母/数字」——只有这种才是纯英文词边界，安全；
 *    · `\b` 左边是 `)`、`|`，或右边是汉字时，判为落在中文分支上。
 */
export function cjkBoundaryHits(line, literal, flags) {
  if (!new RegExp(`[${CJK}]`).test(literal)) return []
  const hits = []
  const isCjk = char => new RegExp(`[${CJK}]`).test(char ?? '')
  const groupEndingAt = index => {
    // literal[index] === ')'；往回配对找到它的 '(' 与内容
    let depth = 0
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      const char = literal[cursor]
      if (char === ')') depth += 1
      else if (char === '(') {
        depth -= 1
        if (depth === 0) return literal.slice(cursor + 1, index)
      }
    }
    return ''
  }
  for (let index = literal.indexOf('\\b'); index !== -1; index = literal.indexOf('\\b', index + 2)) {
    const before = literal[index - 1]
    // 两种才叫「落在中文分支上」：
    //   ① \b 紧跟在汉字后面——那个边界要求下一个字符是 ASCII 词字符，中文文本里几乎不成立；
    //   ② \b 紧跟在一个「含汉字的组」的右括号后面——它对组里的中文分支同样不成立。
    // 其余的 \b（前面是字母、数字、`}`、`|`，或只是 ASCII 组里的词边界）都是正确写法，
    // 一条会误报的闸最后会被关掉。
    if (isCjk(before)) hits.push('cjk-boundary')
    else if (before === ')' && new RegExp(`[${CJK}]`).test(groupEndingAt(index - 1))) hits.push('cjk-boundary')
  }
  return hits
}

/** 行首锚点用在整篇文档上却没有 m。逐行测试（参数里是 line）不算。 */
export function anchorHits(line, literal, flags, afterLiteral) {
  if (flags.includes('m')) return []
  if (!literal.includes('^')) return []
  if (!literal.includes('#')) return [] // 只管标题锚点：那是最常见、也是唯一咬过人的
  // `(?:^|\n)` 是显式的多行写法，等价于 m。
  if (/\(\?:?\^\\?\|\??\\n\)/.test(literal) || literal.includes('^|\\n')) return []
  const call = afterLiteral.match(/\.(?:test|exec)\(\s*([^)]*)/)
  if (!call) return []
  const argument = call[1]
  if (!/\b(?:text|source|doc|docText|body|content)\b|String\(/.test(argument)) return []
  return ['heading-anchor-without-m']
}

// 闸只报嫌疑，判决书在文档手里。
//
// 同一轮它指着 perf-report 的 `(?:ms|毫秒|s)\b` —— 但那条分支后面要求「分位在附近」，
// 而「p95 120 毫秒」这种真实写法由另一条分支（分位→数字）早就吃掉了；改与不改，行为差别
// 只在一种我编得出来的句子上。于是那处回滚了，并在行尾标 `cjk-branch-ok: 理由`。
//
// 抑制必须带理由（冒号后有非空内容），没有理由的裸标记不算数——不然这条闸两天后就
// 变成一排「反正加了就能过」。
const ALLOW = /cjk-branch-ok:\s*\S/

export function scanSource(source) {
  const findings = []
  String(source).split('\n').forEach((line, index) => {
    if (ALLOW.test(line)) return
    LITERAL.lastIndex = 0
    for (const match of line.matchAll(LITERAL)) {
      const literal = match[0]
      const flags = match[1] ?? ''
      const afterLiteral = line.slice((match.index ?? 0) + literal.length)
      for (const rule of [...cjkBoundaryHits(line, literal, flags), ...anchorHits(line, literal, flags, afterLiteral)]) {
        findings.push({ line: index + 1, rule, literal: literal.slice(0, 80), snippet: line.trim().slice(0, 120) })
      }
    }
  })
  return findings
}

async function files() {
  const out = []
  // 只扫 packages/*/src：规则住在这里。测试文件里的 fixture 是**字符串**（故意写着坏正则），
  // 把它们也扫进来，闸会开始报自己。
  for (const dir of ['packages']) {
    const base = resolve(root, dir)
    if (!existsSync(base)) continue
    if (dir === 'packages') {
      for (const slug of await readdir(base)) {
        const src = resolve(base, slug, 'src')
        if (!existsSync(src)) continue
        for (const file of await readdir(src)) if (file.endsWith('.js')) out.push(resolve(src, file))
      }
    } else {
      for (const file of await readdir(base)) if (/\.(?:js|mjs)$/.test(file)) out.push(resolve(base, file))
    }
  }
  return out.sort()
}

async function main() {
  const wantJson = process.argv.includes('--json')
  const rows = []
  for (const file of await files()) {
    const findings = scanSource(await readFile(file, 'utf8'))
    for (const finding of findings) rows.push({ file: relative(root, file), ...finding })
  }
  if (wantJson) {
    console.log(JSON.stringify({ ok: rows.length === 0, findings: rows }, null, 2))
  } else if (rows.length === 0) {
    console.log('正则里的英文分词假设：0 命中（\\b 不挨汉字、行首锚点不带 m 时不整篇测试）')
  } else {
    for (const row of rows) console.error(`${row.file}:${row.line}  ${row.rule}\n    ${row.literal}\n    ${row.snippet}`)
    console.error(`\n${rows.length} 处：\\b 对汉字永不成立；^ 不带 m 时只在第一行匹配。`)
  }
  return rows.length === 0 ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().then(code => process.exit(code)).catch(error => {
    console.error(`审计失败：${error.message || error}`)
    process.exit(2)
  })
}