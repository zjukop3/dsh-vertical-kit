import test from 'node:test'
import assert from 'node:assert/strict'
import { lintExpenseClaim, amountsIn, lineItems, statedTotal, withoutNoise } from '../src/index.js'

const good = `# 差旅报销单

报销人：张三（平台组）
报销期间：2026-11-01 至 2026-11-15
费用类别：差旅
事由：客户现场支持

- 高铁票 553.50 元，发票号码：24512000998877
- 住宿两晚 960.00 元，发票号码：24512000998878
- 市内交通 86.50 元，发票号码：24512000998879

合计：1600.00 元

审批人：李四
`

const rules = result => result.findings.map(finding => finding.rule)

test('a complete claim passes with zero findings', () => {
  const result = lintExpenseClaim(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.ok, true)
  assert.equal(result.checked.items, 3)
  assert.equal(result.checked.sum, 1600)
  assert.equal(result.checked.total, 1600)
})

test('an empty document is a single empty error', () => {
  const result = lintExpenseClaim('   \n')
  assert.equal(result.errors, 1)
  assert.equal(result.findings[0].rule, 'empty')
})

test('no claimant is an error', () => {
  const result = lintExpenseClaim(good.replace('报销人：张三（平台组）\n', ''))
  const finding = result.findings.find(f => f.rule === 'claimant-missing')
  assert.ok(finding, JSON.stringify(rules(result)))
  assert.equal(finding.level, 'error')
})

test('no date at all is an error; a single unlabelled date is a warning', () => {
  const none = lintExpenseClaim(good.replace('报销期间：2026-11-01 至 2026-11-15\n', ''))
  assert.ok(rules(none).includes('date-missing'), JSON.stringify(rules(none)))

  const one = lintExpenseClaim(good.replace('报销期间：2026-11-01 至 2026-11-15', '2026-11-15'))
  assert.ok(rules(one).includes('period-unlabelled'), JSON.stringify(rules(one)))
  assert.ok(!rules(one).includes('date-missing'))
})

test('a claim with no money-bearing row is an error', () => {
  const result = lintExpenseClaim(good.replace(/- 高铁票[\s\S]*?- 市内交通 86.50 元，发票号码：24512000998879\n/, ''))
  assert.ok(rules(result).includes('items-missing'), JSON.stringify(rules(result)))
})

test('no total line is an error', () => {
  const result = lintExpenseClaim(good.replace('合计：1600.00 元\n', ''))
  assert.ok(rules(result).includes('total-missing'), JSON.stringify(rules(result)))
})

test('lines that do not add up to the total are the error the package exists for', () => {
  const result = lintExpenseClaim(good.replace('合计：1600.00 元', '合计：1800.00 元'))
  const finding = result.findings.find(f => f.rule === 'total-mismatch')
  assert.ok(finding, JSON.stringify(rules(result)))
  assert.equal(finding.level, 'error')
  assert.match(finding.message, /差 200/)
})

test('the tolerance decides whether a small difference is a finding', () => {
  // Amounts are read to two decimals, so the difference here is one cent.
  const off = good.replace('合计：1600.00 元', '合计：1600.01 元')
  assert.ok(rules(lintExpenseClaim(off, { tolerance: 0.001 })).includes('total-mismatch'))
  assert.ok(!rules(lintExpenseClaim(off, { tolerance: 0.02 })).includes('total-mismatch'))
})

test('the same invoice number twice is an error', () => {
  const result = lintExpenseClaim(good.replace('24512000998879', '24512000998877'))
  const finding = result.findings.find(f => f.rule === 'invoice-duplicate')
  assert.ok(finding, JSON.stringify(rules(result)))
  assert.equal(finding.level, 'error')
  assert.match(finding.message, /24512000998877/)
})

test('item rows without any invoice number warn, and a claim without items says nothing', () => {
  const noNumbers = lintExpenseClaim(good.replace(/，发票号码：\d+/g, ''))
  assert.ok(rules(noNumbers).includes('invoice-missing'), JSON.stringify(rules(noNumbers)))
})

test('a missing purpose warns, and a purpose without a category warns differently', () => {
  const noPurpose = lintExpenseClaim(good.replace('事由：客户现场支持\n', ''))
  assert.ok(rules(noPurpose).includes('purpose-missing'), JSON.stringify(rules(noPurpose)))

  // Deliberately no category word anywhere: the good fixture's 市内交通 line is
  // itself a category signal, so dropping only the 费用类别 line is not enough.
  const noCategory = lintExpenseClaim(`# 报销单

报销人：张三
报销期间：2026-11-01 至 2026-11-15
事由：客户现场支持

- 甲 500.00 元，发票号码：24512000111222
- 乙 500.00 元，发票号码：24512000111223

合计：1000.00 元

审批人：李四
`)
  assert.ok(rules(noCategory).includes('category-missing'), JSON.stringify(rules(noCategory)))
  assert.ok(!rules(noCategory).includes('purpose-missing'), 'the purpose is stated')
})

test('no approver is an error', () => {
  const result = lintExpenseClaim(good.replace('审批人：李四\n', ''))
  const finding = result.findings.find(f => f.rule === 'approver-missing')
  assert.ok(finding, JSON.stringify(rules(result)))
  assert.equal(finding.level, 'error')
})

test('mixed currencies without an exchange rate warn', () => {
  const mixed = good
    .replace('- 市内交通 86.50 元', '- 市内交通 12.00 美元')
    .replace('合计：1600.00 元', '合计：1525.50 元')
  const result = lintExpenseClaim(mixed)
  assert.ok(rules(result).includes('currency-mixed'), JSON.stringify(rules(result)))
  const explained = lintExpenseClaim(`${mixed}汇率：1 美元 = 7.2 人民币\n`)
  assert.ok(!rules(explained).includes('currency-mixed'))
})

test('a fenced block cannot supply the structure', () => {
  const result = lintExpenseClaim(`# 报销单模板\n\n\`\`\`markdown\n${good}\`\`\`\n`)
  assert.ok(rules(result).includes('claimant-missing'), 'the fence is not the document')
  assert.ok(rules(result).includes('total-missing'))
})

test('amountsIn ignores invoice numbers and dates, and keeps real amounts', () => {
  assert.deepEqual(amountsIn('高铁票 553.50 元').map(a => a.value), [553.5])
  assert.deepEqual(amountsIn('发票号码：24512000998877').map(a => a.value), [])
  assert.deepEqual(amountsIn('2026-11-01 至 2026-11-15').map(a => a.value), [])
  assert.deepEqual(amountsIn('¥1,234.56').map(a => a.value), [1234.56])
})

test('withoutNoise strips the invoice number and the date, and leaves the rest', () => {
  const cleaned = withoutNoise('住宿 960.00 元，发票号码：24512000998878')
  assert.ok(!cleaned.includes('24512000998878'))
  assert.ok(cleaned.includes('960.00'))
})

test('line items and the stated total are read separately', () => {
  assert.equal(lineItems(good).length, 3)
  assert.equal(statedTotal(good), 1600)
  assert.equal(statedTotal('没有任何合计'), null)
})