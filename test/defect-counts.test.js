import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { LEDGER } from '../scripts/defects.mjs'
import { defectOrigin } from '../scripts/build-site.mjs'

// 这一族缺陷在这个仓库里出现太多次了：手写一个数字，旁边的数字是推出来的。
// 2026-11-24：缺陷页的 H1 写着「17 个检测器缺陷」，台账已经是 30；同一页的正文里
// 又用两种不同减法各算了一次「拿真实文件跑出来的」（21 和 24）。读者看到的是同一页
// 上三个互不相等的说法。
//
// 判据不写成「H1 等于 30」——那只是把同一个手写数字换个地方放。判据是：页面里凡出现
// 「N 个检测器缺陷」的地方，N 必须等于台账；发现方式的分布必须加起来等于总数。
const root = resolve(import.meta.dirname, '..')

const pages = ['site/index.html', 'site/corpus/index.html', 'site/defects/index.html']

test('页面里每一个「N 个检测器缺陷」都等于台账，没有例外', async () => {
  for (const page of pages) {
    const html = await readFile(resolve(root, page), 'utf8')
    const counts = [...html.matchAll(/(\d+) 个检测器缺陷/g)].map(match => Number(match[1]))
    assert.ok(counts.length > 0, `${page}: 至少该说一次总数`)
    for (const count of counts) {
      assert.equal(count, LEDGER.total, `${page}: 写着 ${count} 个检测器缺陷，台账是 ${LEDGER.total}`)
    }
  }
})

test('发现方式的分布加起来等于总数，且每一条都有归属', () => {
  const origin = defectOrigin()
  assert.equal(origin.sum, LEDGER.total)
  // 台账里出现过的每一个 foundBy 都必须落在某一组里，否则总数的解释就少了一块。
  const labels = origin.counts.map(([label]) => label)
  assert.deepEqual(
    [...new Set(origin.counts.map(([, count]) => count))].every(count => count >= 0),
    true,
    `分组计数不能是负数：${JSON.stringify(origin.counts)}`,
  )
  assert.ok(labels.includes('静态审计'), '审计这一组必须存在')
  assert.ok(origin.counts.filter(([, count]) => count > 0).length >= 3, '至少三组有内容，否则说明分组把类别吞了')
})

test('分组不会被前缀规则漏掉：台账的 foundBy 全部能被认领', async () => {
  const buckets = [
    key => key.startsWith('third-party'),
    key => key.startsWith('own'),
    key => key === 'merged catalog PRs',
    key => key === 'installing it and calling it',
    key => key === 'rules audit',
  ]
  const unclaimed = Object.keys(LEDGER.bySource).filter(key => !buckets.some(match => match(key)))
  assert.deepEqual(unclaimed, [], `这些 foundBy 没有归属：${unclaimed.join(', ')}`)
})
