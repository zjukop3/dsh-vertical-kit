import test from 'node:test'
import assert from 'node:assert/strict'
import { lintOpsRunbook, numberedSteps } from '../src/index.js'

const good = `# 发布 runbook（bash）

## 前置条件

- 需要先拿到生产 kubeconfig
- 确认值班同事在线

## 步骤

1. 拉取目标镜像
2. 注意：这条会清空缓存目录，先备份 \`rm -rf /var/cache/app\`
3. 滚动重启 deployment
4. 观察 5 分钟错误率

## 验证

验证：错误率回到 0.1% 以下，且 Pod 全部 Ready。

## 回滚

回滚：\`kubectl rollout undo deployment/app\`
`

const bad = `# 发布手册

1. 停服务
2. rm -rf /data
3. 起服务
`

test('a complete runbook passes', () => {
  const result = lintOpsRunbook(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.steps, 4)
})

test('every defect class is reported', () => {
  const result = lintOpsRunbook(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => finding.rule)
  assert.ok(rules.includes('prereq-missing'))
  assert.ok(rules.includes('rollback-missing'))
  assert.ok(rules.includes('verify-missing'))
  assert.ok(rules.includes('shell-unspecified'))
  assert.ok(rules.includes('destructive-unwarned'))
})

test('a destructive command with a warning on the same line is allowed', () => {
  const text = '# r bash\n\n## 前置条件\n\n- 需要先备份\n\n## 步骤\n\n1. 注意：不可逆，先备份 \`rm -rf /data\`\n2. 重启\n3. 观察\n\n## 验证\n\n验证：健康。\n\n## 回滚\n\n回滚：恢复备份。\n'
  const result = lintOpsRunbook(text)
  assert.ok(!result.findings.some(finding => finding.rule === 'destructive-unwarned'))
})

test('each destructive shape is caught', () => {
  for (const command of ['rm -rf /x', 'DROP TABLE users', 'TRUNCATE TABLE t', 'DELETE FROM t', 'kubectl delete pod x', 'terraform destroy', 'git push --force', 'docker system prune', 'dd if=/dev/zero of=/dev/sda']) {
    const text = `# r bash\n\n## 前置条件\n\n- x\n\n## 步骤\n\n1. ${command}\n2. b\n3. c\n\n## 验证\n\n验证：ok。\n\n## 回滚\n\n回滚：ok。\n`
    assert.ok(lintOpsRunbook(text).findings.some(finding => finding.rule === 'destructive-unwarned'), command)
  }
})

test('numberedSteps records whether a step sits under a steps heading', () => {
  const text = '# r\n\n## 步骤\n\n1. 在段内\n\n## 别处\n\n1. 在段外\n'
  const steps = numberedSteps(text)
  assert.deepEqual(steps.map(step => step.inSteps), [true, false])
})

test('a step floor below the count passes, above it warns', () => {
  const text = '# r bash\n\n## 前置条件\n\n- x\n\n## 步骤\n\n1. a\n2. b\n3. c\n\n## 验证\n\n验证：ok。\n\n## 回滚\n\n回滚：ok。\n'
  assert.ok(!lintOpsRunbook(text).findings.some(finding => finding.rule === 'steps-thin'))
  assert.ok(lintOpsRunbook(text, { minSteps: 5 }).findings.some(finding => finding.rule === 'steps-thin'))
})

test('the rollback requirement is configurable away', () => {
  const text = '# r bash\n\n## 前置条件\n\n- x\n\n## 步骤\n\n1. a\n2. b\n3. c\n\n## 验证\n\n验证：ok。\n'
  assert.ok(lintOpsRunbook(text).findings.some(finding => finding.rule === 'rollback-missing'))
  assert.ok(!lintOpsRunbook(text, { requireRollback: false }).findings.some(finding => finding.rule === 'rollback-missing'))
})

test('no numbered steps at all is an error naming the prose problem', () => {
  const result = lintOpsRunbook('# r\n\n随便写了一段话。\n')
  const missing = result.findings.find(finding => finding.rule === 'steps-missing')
  assert.ok(missing)
  assert.match(missing.message, /压力下/)
})
