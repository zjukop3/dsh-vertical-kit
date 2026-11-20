import test from 'node:test'
import assert from 'node:assert/strict'
import { publishedPackages, localeFor, drift, wired, EN_TITLES } from '../scripts/sync-locales.mjs'

const CJK = /[\u4e00-\u9fff]/g

// 量比例而不是量有无：英文描述里合法地引用一句中文（如「体验良好」）不该被判成
// 「中文没翻译过来」。判据是「这段文字的主体语言是什么」，不是「里面有没有一个汉字」。
const cjkRatio = (text) => {
  const visible = String(text).replace(/\s/g, '')
  if (!visible) return 0
  return (visible.match(CJK) || []).length / visible.length
}

test('每个已发布包都有 locale/en.json 与 locale/zh.json，且与生成器一致', () => {
  const d = drift()
  assert.deepEqual(
    d.map((x) => x.pkg),
    [],
    '漂移：' + d.map((x) => `${x.pkg} ${x.file}`).join(', ') + '；跑 node scripts/sync-locales.mjs',
  )
})

test('package.json 已把 locale 暴露出去（exports + files）', () => {
  for (const p of publishedPackages()) {
    assert.ok(wired(p.pkg), `${p.name}: exports 缺 "./locale/*.json" 或 files 缺 "locale"`)
  }
})

test('两份 locale 都是真翻译：en 主体英文、zh 主体中文、标题不同', () => {
  for (const p of publishedPackages()) {
    const { en, zh } = localeFor(p)
    assert.ok(cjkRatio(en.meta.title) < 0.1, `${p.name}: 英文标题主体不是英文`)
    assert.ok(cjkRatio(en.meta.description) < 0.1, `${p.name}: 英文描述主体不是英文`)
    assert.ok(cjkRatio(zh.meta.title) > 0.1, `${p.name}: 中文标题主体不是中文`)
    assert.ok(cjkRatio(zh.meta.description) > 0.3, `${p.name}: 中文描述主体不是中文`)
    assert.notEqual(en.meta.title, zh.meta.title, `${p.name}: 两个语言的标题一样`)
  }
})

test('字段非空且在合理长度内（Plugin Manager 列表会被截断）', () => {
  for (const p of publishedPackages()) {
    const { en, zh } = localeFor(p)
    for (const [lang, m] of Object.entries({ en, zh })) {
      assert.ok(m.meta.title.trim().length > 0, `${p.name}/${lang}: title 为空`)
      assert.ok(m.meta.title.length <= 60, `${p.name}/${lang}: title 超过 60 字`)
      assert.ok(m.meta.description.trim().length > 0, `${p.name}/${lang}: description 为空`)
      assert.ok(m.meta.description.length <= 300, `${p.name}/${lang}: description 超过 300 字`)
    }
  }
})

test('EN_TITLES 恰好覆盖 workspace 里的包：漏一个、多一个都报错', () => {
  const names = publishedPackages().map((p) => p.name).sort()
  assert.deepEqual(Object.keys(EN_TITLES).sort(), names)
})

test('标题不能等于包名（那等于没门面）', () => {
  for (const p of publishedPackages()) {
    const { en } = localeFor(p)
    assert.notEqual(en.meta.title, p.name, `${p.name}: 英文标题就是包名`)
  }
})