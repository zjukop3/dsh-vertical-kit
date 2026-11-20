import test from 'node:test'
import assert from 'node:assert/strict'
import { lintMigrationGuide, versionSpan, numberedSteps } from '../src/index.js'

const good = `# 从 0.1.x 升级到 0.2.0

适用版本：0.1.0 到 0.2.0。

## 破坏性变更

- \`dsh plugin add\` 的 \`--force\` 参数改名为 \`--replace\`。
- 配置文件从 \`config.json\` 迁到 \`config/config.json\`。

## 步骤

1. 备份 profile 目录。
2. 升级 DSH 到 0.2.0。
3. 运行 \`dsh plugin add dsh-review-outbox --replace\`。

## 验证

\`dsh plugin list\` 应显示 0.2.0。

## 回滚

把备份的 profile 目录还原，再装回 0.1.x。
`

const bad = `# 升级说明

我们改了参数名，升级后注意一下。
`

test('a complete guide passes with no findings at all', () => {
  const result = lintMigrationGuide(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.ok, true)
  assert.equal(result.checked.steps, 3)
  assert.ok(result.checked.span, 'span 应被解析出来')
})

test('prose-only guide fires the three blockers and the steps warn', () => {
  const result = lintMigrationGuide(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(f => f.rule)
  for (const rule of ['from-to-missing', 'breaking-missing', 'steps-missing']) {
    assert.ok(rules.includes(rule), `${rule} 没报：${rules.join(',')}`)
  }
  // 没有编号步骤 = 不是流程型指南，恢复类三问（验证/回滚/备份）不查。
  for (const rule of ['verify-missing', 'rollback-missing', 'backup-missing']) {
    assert.ok(!rules.includes(rule), `${rule} 不该在非流程型指南上报：${rules.join(',')}`)
  }
})

test('有编号步骤的流程型指南才问「怎么验证、怎么回滚、有没有备份」', () => {
  const text = good.replace('## 验证\n\n`dsh plugin list` 应显示 0.2.0。\n\n', '').replace('## 回滚\n\n把备份的 profile 目录还原，再装回 0.1.x。\n', '').replace('1. 备份 profile 目录。\n', '1. 停掉正在跑的 profile。\n')
  const result = lintMigrationGuide(text)
  const rules = result.findings.map(f => f.rule)
  for (const rule of ['verify-missing', 'rollback-missing', 'backup-missing']) {
    assert.ok(rules.includes(rule), `${rule} 没报：${rules.join(',')}`)
  }
})

test('标题写了「迁移到 vN」算数，只有版本号不算', () => {
  const target = good.replace('从 0.1.x 升级到 0.2.0', '升级到 0.2.0').replace('适用版本：0.1.0 到 0.2.0。', '')
  assert.ok(!lintMigrationGuide(target).findings.some(f => f.rule === 'from-to-missing'), '写了目标版本不该报')

  const noWord = target.replace('升级到 0.2.0', '版本说明 0.2.0')
  assert.ok(
    lintMigrationGuide(noWord).findings.some(f => f.rule === 'from-to-missing'),
    JSON.stringify(lintMigrationGuide(noWord).findings.map(f => f.rule)),
  )
})

test('散文里提一句「不兼容」不算破坏性变更清单', () => {
  const text = good.replace('## 破坏性变更\n\n- `dsh plugin add` 的 `--force` 参数改名为 `--replace`。\n- 配置文件从 `config.json` 迁到 `config/config.json`。\n\n', '这次改动不兼容旧版，主要是一个参数名。\n\n')
  const result = lintMigrationGuide(text)
  assert.ok(result.findings.some(f => f.rule === 'breaking-missing'), JSON.stringify(result.findings.map(f => f.rule)))
})

test('步骤太少只 warn，下限可调', () => {
  const text = good.replace('3. 运行 `dsh plugin add dsh-review-outbox --replace`。\n', '')
  const strict = lintMigrationGuide(text)
  assert.ok(strict.findings.some(f => f.rule === 'steps-thin'))
  const relaxed = lintMigrationGuide(text, { minSteps: 2 })
  assert.ok(!relaxed.findings.some(f => f.rule === 'steps-thin'))
})

test('require-rollback 把「没写回滚」升级为 error', () => {
  const text = good.replace('## 回滚\n\n把备份的 profile 目录还原，再装回 0.1.x。\n', '')
  const relaxed = lintMigrationGuide(text)
  const strict = lintMigrationGuide(text, { requireRollback: true })
  assert.equal(relaxed.findings.find(f => f.rule === 'rollback-missing').level, 'warn')
  assert.equal(strict.findings.find(f => f.rule === 'rollback-missing').level, 'error')
})

test('versionSpan 认箭头、认 from/to、认中文到', () => {
  assert.ok(versionSpan('0.1.7 → 0.2.0'))
  assert.ok(versionSpan('from v1.2 to v2.0'))
  assert.ok(versionSpan('从 0.1.0 到 0.2.0'))
  assert.equal(versionSpan('升级到 0.2.0'), null)
})

test('numberedSteps 只收编号行，散文不算步骤', () => {
  const text = good
  assert.equal(numberedSteps(text).length, 3)
  assert.equal(numberedSteps('先备份，再升级，最后验证。').length, 0)
})
// title-missing had only the silent direction (the good fixture). A rule that no
// test makes fire is a rule nobody has seen work.
test('没有一级标题时 title-missing 报错，且指在第一行', () => {
  const text = '升级说明：从 0.1.0 到 0.2.0。\n\n## 破坏性变更\n\n- 参数改名。\n\n## 步骤\n\n1. 备份\n2. 升级\n3. 验证\n\n## 验证\n\n看列表。\n\n## 回滚\n\n还原备份。\n'
  const result = lintMigrationGuide(text)
  const finding = result.findings.find(f => f.rule === 'title-missing')
  assert.ok(finding, JSON.stringify(result.findings.map(f => f.rule)))
  assert.equal(finding.level, 'error')
  assert.equal(finding.line, 1)
})
