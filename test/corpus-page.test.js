import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CHECKS } from '../scripts/checks-data.mjs'
import { LEDGER } from '../scripts/defects.mjs'

// 语料页专门讲「这些规则验证到什么程度」，所以它自己的数字必须是真的。
//
// 2026-11-23：那一页是一段手写 HTML，写着「22 个检查」「5 + 6 + 11」「17 个缺陷」——
// 而当时仓库里有 28 个检查、21 个缺陷，其中 10 个检查跑过别人的文件。三处数字各自过期
// 在不同的月份。一个讲可信度的页面在自己的数字上撒谎，比不写更糟。
//
// 现在正文由 scripts/build-site.mjs 从 CHECKS 的 corpus 字段推出来，这条闸守住三件事：
// 三层人数、真实文档合计、缺陷数，都必须等于数据；而且每个检查只出现在一层里。
const root = resolve(import.meta.dirname, '..')

const layerOf = check => check.corpus?.layer ?? 'fixtures'

test('语料页的三层人数、合计与缺陷数都由数据推出，不是手写的', async () => {
  const html = await readFile(resolve(root, 'site/corpus/index.html'), 'utf8')
  const by = layer => CHECKS.filter(check => layerOf(check) === layer)
  const strangers = by('strangers')
  const own = by('own')
  const fixtures = by('fixtures')

  assert.match(html, new RegExp(`第一层：跑过别人写的文件（${strangers.length} 个检查）`))
  assert.match(html, new RegExp(`第二层：跑过自家真实产物（${own.length} 个检查）`))
  assert.match(html, new RegExp(`第三层：只有自造样例（${fixtures.length} 个检查）`))

  const total = [...strangers, ...own].reduce((sum, check) => sum + check.corpus.count, 0)
  assert.match(html, new RegExp(`合计 ${total} 份真实文档`), `页面上缺「合计 ${total} 份真实文档」——改完数据要重跑 node scripts/build-site.mjs`)

  assert.match(html, new RegExp(`找出 <strong>${LEDGER.total} 个检测器缺陷</strong>`), '缺陷总数与台账不一致')
})

test('每个检查在语料页里恰好出现一次，且出现在自己那一层', async () => {
  const html = await readFile(resolve(root, 'site/corpus/index.html'), 'utf8')
  const section = name => {
    const start = html.indexOf(name)
    const next = html.indexOf('<h2>', start + name.length)
    return html.slice(start, next === -1 ? undefined : next)
  }
  const layers = {
    strangers: section('第一层'),
    own: section('第二层'),
    fixtures: section('第三层'),
  }
  for (const check of CHECKS) {
    const layer = layerOf(check)
    const appearances = Object.entries(layers).filter(([, text]) => text.includes(check.slug)).map(([name]) => name)
    assert.deepEqual(appearances, [layer], `${check.slug} 应只出现在 ${layer}，实际出现在 ${appearances.join('/') || '无'}`)
  }
})

test('每个检查都声明了语料层，没有漏填的', () => {
  const unset = CHECKS.filter(check => !check.corpus || !['strangers', 'own', 'fixtures'].includes(check.corpus.layer))
  assert.deepEqual(unset.map(check => check.slug), [], '这些检查没填 corpus 字段')
  const strangers = CHECKS.filter(check => layerOf(check) === 'strangers')
  for (const check of strangers) {
    assert.ok(check.corpus.source && check.corpus.count > 0, `${check.slug} 声称跑过陌生人的文件，却没说是什么、几份`)
  }
})
