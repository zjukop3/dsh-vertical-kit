import test from 'node:test'
import assert from 'node:assert/strict'
import { lintListings, parseCsv, stuffedTokens } from '../src/index.js'

const csv = `title,price,sku
全自动懒人支架手机桌面通用, 29.9, SKU001
保温杯男女士大容量316不锈钢, 59, SKU002
手机支架手机支架手机支架通用, 9.9, SKU003
超便宜, 0, SKU004
没有价格的商品, , SKU005
, 19.9, SKU006
重复货, 39.9, SKU002
`

test('csv parses with quoted fields and crlf', () => {
  const rows = parseCsv('a,b\r\n"x,1",y\r\n"say ""hi""",z\r\n')
  assert.deepEqual(rows, [['a', 'b'], ['x,1', 'y'], ['say "hi"', 'z']])
})

test('a clean listing passes and bounds are configurable', () => {
  const rows = 'title,price,sku\n全自动懒人支架手机桌面通用, 29.9, SKU001\n'
  assert.deepEqual(lintListings(rows).findings, [])
  assert.deepEqual(lintListings(rows, { minTitle: 30 }).findings[0].rule, 'title-short')
})

test('every defect class is reported on its own row', () => {
  const result = lintListings(csv)
  assert.equal(result.checked, 7)
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => `${finding.rule}:${finding.row}`)
  assert.ok(rules.includes('title-short:4'))
  assert.ok(rules.includes('price-invalid:4'))
  assert.ok(rules.includes('price-missing:5'))
  assert.ok(rules.includes('title-missing:6'))
  assert.ok(rules.includes('sku-duplicate:7'))
})

test('keyword stuffing is a warning with the token and count', () => {
  const result = lintListings(csv)
  const stuffing = result.findings.filter(finding => finding.rule === 'title-stuffing')
  assert.equal(stuffing.length, 1)
  assert.match(stuffing[0].message, /手机支架/)
  assert.match(stuffing[0].message, /重复 3 次（上限 3）$/)
})

test('stuffedTokens catches a back-to-back run and separated repeats, not single characters', () => {
  assert.deepEqual(stuffedTokens('手机支架手机支架手机支架通用').map(entry => entry.token), ['手机支架'])
  assert.deepEqual(stuffedTokens('手机支架 通用 手机支架 办公 手机支架 车载').map(entry => entry.token), ['手机支架'])
  assert.deepEqual(stuffedTokens('保温杯男女士大容量316不锈钢'), [])
  assert.deepEqual(stuffedTokens('懒人神器懒人神器懒人神器懒人神器').map(entry => entry.count), [4])
  assert.deepEqual(stuffedTokens('手机支架 通用 手机支架 办公 手机支架 车载').map(entry => entry.token), ['手机支架'])
})

test('bounds are configurable through rules', () => {
  const rows = 'title,price,sku\n全自动懒人支架手机桌面通用, 999, SKU001\n'
  const result = lintListings(rows, { maxPrice: 500 })
  assert.ok(result.findings.some(finding => finding.rule === 'price-high'))
})
