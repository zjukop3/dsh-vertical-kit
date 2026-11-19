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

test('numbered headings are steps, and their body carries the command', () => {
  // This project's own two runbooks order their steps as `## 3. …` headings.
  // Both were reported as having no steps at all, which is the same
  // spelling-versus-property mistake that cost four other checks a release.
  const doc = `# 发布手册

## 前置条件

Node 22 与 npm，已登录 registry。

## 1. 改版本号

编辑 package.json。

## 2. 清理构建产物

\`\`\`bash
rm -rf site
\`\`\`

## 3. 推送

\`\`\`bash
git push
\`\`\`

## 回滚

git revert。

## 验证

curl 返回 200。
`
  const steps = numberedSteps(doc)
  assert.equal(steps.length, 3, JSON.stringify(steps.map(s => s.text)))
  assert.ok(!lintOpsRunbook(doc).findings.some(f => f.rule === 'steps-missing' || f.rule === 'steps-thin'))

  // The rm -rf lives in step 2's body, so the warning rule must read the body.
  const finding = lintOpsRunbook(doc).findings.find(f => f.rule === 'destructive-unwarned')
  assert.ok(finding, 'a destructive command in a numbered heading step is still a destructive command')
  assert.equal(finding.line, 11, 'the finding points at the step, not at the command line')

  const warned = doc.replace('rm -rf site', 'rm -rf site   # 注意：先备份 site/')
  assert.ok(!lintOpsRunbook(warned).findings.some(f => f.rule === 'destructive-unwarned'))
})

test('a runbook of prose still has no steps', () => {
  const prose = `# 手册

## 前置条件

Node 22。

先把版本号改掉，然后清理产物，最后推送。

## 回滚

git revert。

## 验证

curl 返回 200。
`
  assert.ok(lintOpsRunbook(prose).findings.some(f => f.rule === 'steps-missing'))
})
