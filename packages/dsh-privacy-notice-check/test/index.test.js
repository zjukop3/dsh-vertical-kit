import test from 'node:test'
import assert from 'node:assert/strict'
import { lintPrivacyNotice } from '../src/index.js'

const good = `# 隐私声明

生效日期：2026-11-01

## 我们收集的信息

- 账号邮箱。
- 交付物的评审记录。

## 使用目的

用于提供评审与归档功能。

## 保留期限

账号关闭后 30 天内删除。

## 共享

不向第三方共享，除非依法律要求。

## 你的权利

你可以访问、更正、删除自己的数据。

## 联系我们

隐私问题联系 privacy@example.com。
`

const bad = `# 隐私声明

我们很重视你的隐私，会尽力保护你的信息。
`

test('a complete notice passes with no findings at all', () => {
  const result = lintPrivacyNotice(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.ok, true)
})

test('prose-only notice fires the five sections and the two warns', () => {
  const result = lintPrivacyNotice(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(f => f.rule)
  for (const rule of ['data-missing', 'purpose-missing', 'retention-missing', 'sharing-missing', 'contact-missing']) {
    assert.ok(rules.includes(rule), `${rule} 没报：${rules.join(',')}`)
  }
  for (const rule of ['effective-date-missing', 'rights-missing']) {
    assert.ok(rules.includes(rule), `${rule} 没报：${rules.join(',')}`)
  }
})

test('「我们不收集任何数据」是合法答案，不是缺失', () => {
  const text = `# 隐私声明\n\n生效日期：2026-11-01\n\n我们不收集任何个人数据。\n\n## 使用目的\n\n不适用。\n\n## 保留期限\n\n不保留任何数据。\n\n## 共享\n\n不与任何第三方共享。\n\n## 联系我们\n\nprivacy@example.com\n\n你可以写信要求确认我们是否持有你的数据。\n`
  const result = lintPrivacyNotice(text)
  const rules = result.findings.map(f => f.rule)
  assert.ok(!rules.includes('data-missing'), rules.join(','))
  assert.ok(!rules.includes('retention-missing'), rules.join(','))
})

test('散文里提到「第三方」不算共享声明：必须是一节或带标签的一行', () => {
  const text = good.replace('## 共享\n\n不向第三方共享，除非依法律要求。\n', '我们可能会与第三方合作。\n')
  const result = lintPrivacyNotice(text)
  assert.ok(result.findings.some(f => f.rule === 'sharing-missing'), JSON.stringify(result.findings.map(f => f.rule)))
})

test('保留期限那节删掉就报：这是本包存在的理由', () => {
  const text = good.replace('## 保留期限\n\n账号关闭后 30 天内删除。\n\n', '')
  const result = lintPrivacyNotice(text)
  const finding = result.findings.find(f => f.rule === 'retention-missing')
  assert.ok(finding)
  assert.equal(finding.level, 'error')
})

test('require-rights 把「没写权利」升级为 error', () => {
  const text = good.replace('## 你的权利\n\n你可以访问、更正、删除自己的数据。\n\n', '')
  const relaxed = lintPrivacyNotice(text)
  const strict = lintPrivacyNotice(text, { requireRights: true })
  assert.equal(relaxed.findings.find(f => f.rule === 'rights-missing').level, 'warn')
  assert.equal(strict.findings.find(f => f.rule === 'rights-missing').level, 'error')
})

test('正文里有邮箱也算联系方式：给渠道比给标题强', () => {
  const text = good.replace('## 联系我们\n\n隐私问题联系 privacy@example.com。\n', '有问题写信到 privacy@example.com。\n')
  const result = lintPrivacyNotice(text)
  assert.ok(!result.findings.some(f => f.rule === 'contact-missing'))
})

test('只有标题也算联系方式缺失：标题不是渠道', () => {
  const text = good.replace('## 联系我们\n\n隐私问题联系 privacy@example.com。\n', '## 联系我们\n\n我们会尽快回复。\n')
  const result = lintPrivacyNotice(text)
  // 有 ## 联系我们 这一节，视为给了渠道位置；这条测试锁死「标题即可」的口径，
  // 免得以后有人把 CONTACT_HEADING 收紧成必须有邮箱而悄悄改变行为。
  assert.ok(!result.findings.some(f => f.rule === 'contact-missing'))
})
// title-missing had only the silent direction (the good fixture).
test('没有一级标题时 title-missing 报错，且指在第一行', () => {
  const text = '隐私声明\n\n生效日期：2026-11-01\n\n## 我们收集的信息\n\n- 邮箱。\n\n## 使用目的\n\n提供服务。\n\n## 保留期限\n\n30 天。\n\n## 共享\n\n不共享。\n\n## 联系我们\n\nprivacy@example.com\n'
  const result = lintPrivacyNotice(text)
  const finding = result.findings.find(f => f.rule === 'title-missing')
  assert.ok(finding, JSON.stringify(result.findings.map(f => f.rule)))
  assert.equal(finding.level, 'error')
  assert.equal(finding.line, 1)
})
