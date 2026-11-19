// Route and direct call must produce the same answer.
//
// Every package's README says the CLI and the host route share one
// implementation "so they cannot disagree". The CLI is tested. The route was
// asserted, not measured — the DSH host was never available in this environment,
// so the claim rested on reading the code. This test closes that gap without
// DSH: call the exported apply() with a minimal ctx, serve the registered
// handler over a real socket, and compare the HTTP response to the direct call
// byte for byte.
//
// It also checks the two behaviours a caller depends on: a non-POST method is
// refused with 405, and a request with neither text nor path is refused with
// 400.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

const CASES = [
  { pkg: 'dsh-agreement-check', lint: 'lintContract', path: '/agreement-check/api', sample: '甲方：甲公司\n乙方：乙公司\n' },
  { pkg: 'dsh-invoice-check', lint: 'lintInvoice', path: '/invoice-check/api', sample: '发票号码：24512000000123456789\n' },
  { pkg: 'dsh-listing-check', lint: 'lintListings', path: '/listing-check/api', sample: 'title,price,sku\n超便宜, 0, SKU001\n' },
  { pkg: 'dsh-meeting-notes-check', lint: 'lintMeetingNotes', path: '/meeting-notes-check/api', sample: '# 周会\n\n今天讨论了很多。\n' },
  { pkg: 'dsh-resume-check', lint: 'lintResume', path: '/resume-check/api', sample: '# 张三\n\nA公司 2020.1 - 2021.1\n' },
  { pkg: 'dsh-release-notes-check', lint: 'lintReleaseNotes', path: '/release-notes-check/api', sample: '# Changelog\n\n改了点东西。\n' },
  { pkg: 'dsh-weekly-report-check', lint: 'lintWeeklyReport', path: '/weekly-report-check/api', sample: '# 周报\n\n很忙。\n' },
  { pkg: 'dsh-bug-report-check', lint: 'lintBugReport', path: '/bug-report-check/api', sample: '# 登录坏了\n\n今天登录不行。\n' },
  { pkg: 'dsh-api-doc-check', lint: 'lintApiDoc', path: '/api-doc-check/api', sample: '# 接口\n\n在 /v1/x 上。\n' },
  { pkg: 'dsh-test-report-check', lint: 'lintTestReport', path: '/test-report-check/api', sample: '# 测试报告\n\n都过了。\n' },
  { pkg: 'dsh-commit-msg-check', lint: 'lintCommitMessage', path: '/commit-msg-check/api', sample: '修了点东西\n' },
  { pkg: 'dsh-dockerfile-check', lint: 'lintDockerfile', path: '/dockerfile-check/api', sample: 'FROM node\n' },
  { pkg: 'dsh-env-example-check', lint: 'lintEnvExample', path: '/env-example-check/api', sample: 'A=1\n' },
  { pkg: 'dsh-license-check', lint: 'lintLicense', path: '/license-check/api', sample: 'Copyright 2026 someone\n' },
  { pkg: 'dsh-incident-report-check', lint: 'lintIncidentReport', path: '/incident-report-check/api', sample: '# 事故\n\n挂了。\n' },
  { pkg: 'dsh-ops-runbook-check', lint: 'lintOpsRunbook', path: '/ops-runbook-check/api', sample: '# 手册\n\n1. 停服务\n' },
  { pkg: 'dsh-pr-description-check', lint: 'lintPrDescription', path: '/pr-description-check/api', sample: '修了点东西\n' },
  { pkg: 'dsh-spec-doc-check', lint: 'lintSpecDoc', path: '/spec-doc-check/api', sample: '# 方案\n\n想重做。\n' },
  { pkg: 'dsh-adr-check', lint: 'lintAdr', path: '/adr-check/api', sample: '# ADR-1\n\n## 背景\n\n慢。\n' },
  { pkg: 'dsh-onboarding-check', lint: 'lintOnboarding', path: '/onboarding-check/api', sample: '# 上手\n\n挺好的。\n' },
]

async function withServer(handler, run) {
  const server = createServer((request, response) => handler(request, response))
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  try {
    return await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise(done => server.close(done))
  }
}

// The ctx a DSH host provides, reduced to what these packages use.
function makeCtx() {
  const state = { route: null }
  const ctx = {
    webServer: { register(spec) { state.route = spec } },
    effect(fn) { fn() },
  }
  return { ctx, state }
}

for (const entry of CASES) {
  test(`${entry.pkg}: the route returns exactly what the direct call returns`, async () => {
    const mod = await import(`../packages/${entry.pkg}/src/index.js`)
    assert.equal(typeof mod.apply, 'function', `${entry.pkg} must export apply`)
    assert.equal(typeof mod[entry.lint], 'function', `${entry.pkg} must export ${entry.lint}`)

    const { ctx, state } = makeCtx()
    mod.apply(ctx, {})
    assert.ok(state.route, `${entry.pkg} apply() must register a route`)
    assert.equal(state.route.path, entry.path)

    await withServer(state.route.handler, async base => {
      const response = await fetch(`${base}${entry.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: entry.sample }),
      })
      assert.equal(response.status, 200)
      const overHttp = await response.json()
      const direct = mod[entry.lint](entry.sample)
      assert.deepEqual(overHttp, direct, `${entry.pkg}: route and direct call disagree`)
    })
  })

  test(`${entry.pkg}: the route refuses a GET and an empty body`, async () => {
    const mod = await import(`../packages/${entry.pkg}/src/index.js`)
    const { ctx, state } = makeCtx()
    mod.apply(ctx, {})

    await withServer(state.route.handler, async base => {
      const get = await fetch(`${base}${entry.path}`)
      assert.equal(get.status, 405)
      assert.match(String((await get.json()).error), /POST only/)

      const empty = await fetch(`${base}${entry.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      assert.equal(empty.status, 400)
      assert.match(String((await empty.json()).error), /text or path is required/)
    })
  })
}

test('the route honours a configured mount path', async () => {
  const mod = await import('../packages/dsh-listing-check/src/index.js')
  const { ctx, state } = makeCtx()
  mod.apply(ctx, { path: '/custom/mount' })
  assert.equal(state.route.path, '/custom/mount')
})