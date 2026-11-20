import test from 'node:test'
import assert from 'node:assert/strict'
import { lintSecurityAdvisory, severityOf } from '../src/index.js'

const good = `# CVE-2026-12345：备份导出接口未校验归属

- 严重程度：high
- 受影响版本：dsh-review-outbox <= 0.1.10
- 修复版本：0.1.11
- 披露日期：2026-11-18

## 影响

任意登录用户可以导出他人的评审包。

## 缓解措施

升级前可以用 DSH_EXPORT=off 关闭导出接口。

## 致谢

感谢 @someone 报告，联系 security@example.com。
`

const bad = `# 备份导出接口存在越权问题

我们最近发现备份导出接口没有校验归属，任意登录用户可以导出他人的评审包。建议尽快升级。
`

test('a complete advisory passes with no findings at all', () => {
  const result = lintSecurityAdvisory(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.severity, 'high')
  assert.equal(result.ok, true)
})

test('a prose-only advisory fires the four facts plus the disclosure warn', () => {
  const result = lintSecurityAdvisory(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => finding.rule)
  for (const rule of ['id-missing', 'severity-missing', 'affected-missing', 'fixed-missing']) {
    assert.ok(rules.includes(rule), `${rule} 没报：${rules.join(',')}`)
  }
  assert.ok(rules.includes('disclosure-date-missing'), rules.join(','))
  // 缓解与联系渠道默认不查：真实公告里 18/20 与 15/20 都没有，默认报等于噪音。
  assert.ok(!rules.includes('workaround-missing'), rules.join(','))
  assert.ok(!rules.includes('contact-missing'), rules.join(','))
  assert.ok(!rules.includes('title-missing'), '标题存在，不该报 title-missing')
})

test('「建议尽快升级」不算修复版本：没有版本号就是 fixed-missing', () => {
  const text = good.replace('- 修复版本：0.1.11\n', '').replace('修复版本：0.1.11', '')
  const result = lintSecurityAdvisory(text)
  assert.ok(result.findings.some(f => f.rule === 'fixed-missing'))
})

test('有修复版本不等于有受影响范围：两个事实分开判', () => {
  const text = good.replace('- 受影响版本：dsh-review-outbox <= 0.1.10\n', '')
  const result = lintSecurityAdvisory(text)
  const rules = result.findings.map(f => f.rule)
  assert.ok(rules.includes('affected-missing'), rules.join(','))
  assert.ok(!rules.includes('fixed-missing'), '修复版本还在，不该报 fixed-missing')
})

test('「受影响范围：无」是合法答案，不是缺失', () => {
  const text = good.replace('dsh-review-outbox <= 0.1.10', '无')
  const result = lintSecurityAdvisory(text)
  assert.ok(!result.findings.some(f => f.rule === 'affected-missing'))
})

test('severity 归一化：中英两种写法都认，读不出来的返回 null', () => {
  assert.equal(severityOf('严重程度：critical'), 'critical')
  assert.equal(severityOf('危险等级：高危'), 'high')
  assert.equal(severityOf('severity: Medium'), 'medium')
  assert.equal(severityOf('严重性：低危'), 'low')
  assert.equal(severityOf('这个漏洞挺严重的'), null)
})

test('散文里的「严重」不算等级：severity 必须被显式写成等级', () => {
  const text = good.replace('- 严重程度：high\n', '').replace(/{{.*}}/, '')
  const noLevel = text.replace('CVE-2026-12345：备份导出接口未校验归属', 'CVE-2026-12345：一个严重的越权问题')
  const result = lintSecurityAdvisory(noLevel)
  assert.equal(result.checked.severity, null)
  assert.ok(result.findings.some(f => f.rule === 'severity-missing'))
})

test('check-workaround 是开关：不开不报，开了才报', () => {
  const text = good.replace('## 缓解措施\n\n升级前可以用 DSH_EXPORT=off 关闭导出接口。\n\n', '')
  const off = lintSecurityAdvisory(text)
  const on = lintSecurityAdvisory(text, { checkWorkaround: true })
  assert.ok(!off.findings.some(f => f.rule === 'workaround-missing'), '默认不该报')
  assert.equal(on.findings.find(f => f.rule === 'workaround-missing').level, 'warn')
  // 旧参数名仍然被接受，避免 0.1.1 的调用方突然失效
  assert.ok(lintSecurityAdvisory(text, { requireWorkaround: true }).findings.some(f => f.rule === 'workaround-missing'))
})

test('check-contact 同样是一个开关', () => {
  // 整节删掉，包括「## 致谢」这个标题——只删邮箱那半句的话，标题仍然算渠道，
  // 那是测试自己写错了，不是规则漏报。
  const text = good.replace('## 致谢\n\n感谢 @someone 报告，联系 security@example.com。\n', '')
  assert.ok(!lintSecurityAdvisory(text).findings.some(f => f.rule === 'contact-missing'), '默认不该报')
  assert.ok(lintSecurityAdvisory(text, { checkContact: true }).findings.some(f => f.rule === 'contact-missing'), '开关打开应报')
})

test('「暂无可用缓解」也是答案：开关打开时也不该报', () => {
  const text = good.replace('升级前可以用 DSH_EXPORT=off 关闭导出接口。', '暂无可用缓解，请升级到 0.1.11。')
  const result = lintSecurityAdvisory(text, { checkWorkaround: true })
  assert.ok(!result.findings.some(f => f.rule === 'workaround-missing'))
})

// 真实语料：20 条 GHSA 记录里 20 条没有 patched_versions、其中 13 条正文也没提
// 修复。"没修" 与 "漏写" 在文本上分不开，所以「暂无可用修复」必须被当作答案。
test('写了「暂无可用修复」就不再报 fixed-missing', () => {
  const text = good.replace('- 修复版本：0.1.11\n', '').replace('## 影响\n', '## 影响\n\n该问题暂无可用修复版本。\n')
  const result = lintSecurityAdvisory(text)
  assert.ok(!result.findings.some(f => f.rule === 'fixed-missing'), JSON.stringify(result.findings.map(f => f.rule)))
})

test('真实 GHSA 正文形态：只给描述时恰好报四个事实缺失', () => {
  const descriptionOnly = `# Proxy bypass in the widget loader\n\n### Impact\n\nAn attacker can reach internal hosts through the loader.\n\n### Patches\n\nUsers should upgrade.\n`
  const result = lintSecurityAdvisory(descriptionOnly)
  const errors = result.findings.filter(f => f.level === 'error').map(f => f.rule).sort()
  assert.deepEqual(errors, ['affected-missing', 'fixed-missing', 'id-missing', 'severity-missing'])
  // 正文里没有披露日期，这一条按 warn 报；缓解与联系渠道默认不查。
  assert.deepEqual(result.findings.filter(f => f.level === 'warn').map(f => f.rule), ['disclosure-date-missing'])
})

test('GHSA 编号也被认作编号', () => {
  const text = good.replace('CVE-2026-12345', 'GHSA-abcd-efgh-ijkl')
  const result = lintSecurityAdvisory(text)
  assert.ok(!result.findings.some(f => f.rule === 'id-missing'))
})