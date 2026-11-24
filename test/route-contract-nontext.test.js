import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 输入不是文本的那条路由，单独覆盖它的契约。
//
// 大部分检查吃一份文档，所以 route-parity 的矩阵是「同一份 text 走路由与走函数必须一致」。
// dsh-plugin-package-check 吃的是一个包目录 —— 对它喂文本没有意义。给它自己的断言，
// 而不是把它塞进一个测不出东西的矩阵里装作被测过。
test('plugin-package-check 的路由：收 path（目录），拒 text，非 POST 拒 405', async () => {
  const mod = await import('../packages/dsh-plugin-package-check/src/index.js')
  const state = { route: null }
  mod.apply({ webServer: { register(spec) { state.route = spec } }, effect(fn) { fn() } }, {})
  assert.equal(state.route.path, '/plugin-package-check/api')

  const dir = mkdtempSync(join(tmpdir(), 'dsh-nontext-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-x', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(join(dir, 'cordis.patch.yml'), "- insert:\n    - id: x\n      name: 'dsh-x'\n")

  const server = createServer((req, res) => state.route.handler(req, res))
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  const url = `http://127.0.0.1:${port}${state.route.path}`
  try {
    const ok = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: dir }) })
    assert.equal(ok.status, 200)
    const body = await ok.json()
    assert.equal(body.checked.package, 'dsh-x')
    assert.deepEqual(body, mod.lintPluginPackage(dir))

    const noPath = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '# 一份文档' }) })
    assert.equal(noPath.status, 400, '喂文本应当被拒，因为它读的是目录')

    const missing = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: join(dir, 'nope') }) })
    assert.equal(missing.status, 400)

    const get = await fetch(url)
    assert.equal(get.status, 405)
  } finally {
    await new Promise(done => server.close(done))
    rmSync(dir, { recursive: true, force: true })
  }
})
