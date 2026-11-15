// Builds the crawlable site for the three industry checks. Each page is bound
// to the noun a person in that trade would search when they have the problem:
// 合同、发票、商品信息. The rules come from the same comparisons the tests
// enforce, so the page cannot drift from the tool.

import { mkdir, writeFile } from 'node:fs/promises'
import { readIndexNowConfig } from './indexnow-config.mjs'
import { resolve } from 'node:path'

import { CHECKS, ORIGIN, REPO, KIT } from "./checks-data.mjs"

const styles = 'body{max-width:840px;margin:6vh auto;padding:24px;background:#fafaf8;color:#0a0a0a;font:16px/1.7 system-ui,sans-serif}main{border-top:8px solid #b8860b}h1{font-size:clamp(30px,5.5vw,48px);font-weight:250;line-height:1.15;margin-bottom:16px}h2{font-size:22px;font-weight:500;margin-top:36px}p,li,td,th{color:#3d3d3d}a{color:#002fa7}code{font:.9em/1.5 ui-monospace,monospace;background:#f0f0ee;padding:2px 5px;border-radius:3px}pre{padding:14px;overflow:auto;background:#0a0a0a;color:#fff}pre code{background:none;color:inherit;padding:0}table{border-collapse:collapse;width:100%;font-size:14px;margin:16px 0}th,td{border:1px solid #d4d4d2;padding:9px 11px;text-align:left;vertical-align:top}th{background:#f0f0ee}.eyebrow{font:12px/1.4 ui-monospace,monospace;letter-spacing:.12em;color:#b8860b}.nav{margin:24px 0;font-size:14px}.nav a{margin-right:14px}.limit{margin-top:28px;padding:14px 18px;background:#f0f0ee;border-left:4px solid #b8860b}small{display:block;margin-top:32px;color:#737373}@media(max-width:600px){body{margin:2vh auto;padding:18px}}'

const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function page(check) {
  const url = `${ORIGIN}/${check.slug}/`
  const rules = check.rules
    .map(([rule, meaning]) => `<tr><td><code>${esc(rule)}</code></td><td>${esc(meaning)}</td></tr>`)
    .join('')
  const commands = check.usage.map(command => `<pre><code>${esc(command)}</code></pre>`).join('')
  const example = check.example ? `<h2>真实输入输出</h2>
<details><summary>输入</summary><pre><code>${esc(check.example.fixture)}</code></pre></details>
<pre><code>${esc(check.example.output)}</code></pre>
<p>出口码：${esc(check.example.exit)}。输出为真实 CLI 运行的逐字结果，由测试与工具保持同步。</p>` : ''
  const nav = CHECKS.map(entry => `<a href="../${entry.slug}/">${entry.npm}</a>`).join('') + '<a href="https://zjukop3.github.io/dsh-review-outbox/ecosystem/">生态月报</a>'
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(check.title)} · ${check.npm}</title><meta name="description" content="${esc(check.description)}"><meta name="robots" content="index,follow"><link rel="canonical" href="${esc(url)}"><style>${styles}</style></head><body><main>
<p class="eyebrow">DSH VERTICAL KIT · ${esc(check.noun)}</p>
<h1>${esc(check.title)}</h1>
<p><strong>它决定一件事：</strong>${esc(check.decides)}。</p>
<nav class="nav">${nav}<a href="${REPO}">GitHub 源码</a><a href="https://www.npmjs.com/package/${check.npm}">npm</a></nav>
<h2>检查规则</h2>
<table><tr><th>规则</th><th>判定</th></tr>${rules}</table>
<h2>用法</h2>
${commands}
${example}
<p>出口码：<code>0</code> 干净、<code>1</code> 有发现、<code>2</code> 用法或读文件错误。<code>--json</code> 输出机器可读结果。DSH 内同样的函数在 <code>POST /${check.slug}/api</code>（<code>{"text":"…"}</code> 或 <code>{"path":"…"}</code>），面板与 CI 调同一实现。</p>
<div class="limit"><strong>这是清单，不是专业人士。</strong>合同检查不是法律意见，发票检查不判税务合规，listing 检查不判商业价值。每条发现都是文本里可判定的结构缺陷，带行号。</div>
<small>${esc(check.note)} · <a href="${REPO}#readme">dsh-vertical-kit</a> · 通用检查（哈希/引用/结构/表格/数字）在 <a href="${KIT}">dsh-verify-kit</a></small>
</main></body></html>`
}

function home() {
  const rows = CHECKS.map(check => {
    const url = `${ORIGIN}/${check.slug}/`
    return `<tr><td><a href="${esc(url)}">${esc(check.title)}</a></td><td>${esc(check.npm)}</td><td>${esc(check.noun)}</td><td>${esc(check.decides)}</td></tr>`
  }).join('')
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>dsh-vertical-kit · 行业场景交付检查</title><meta name="description" content="行业场景的确定性交付检查：合同结构、发票勾稽、电商商品信息。每个一个命令，从文件本身判定，不调用任何模型，出口码可接 CI。"><meta name="robots" content="index,follow"><link rel="canonical" href="${esc(`${ORIGIN}/`)}"><style>${styles}</style></head><body><main>
<p class="eyebrow">DSH VERTICAL KIT</p>
<h1>行业场景交付检查</h1>
<p>Agent 已经产出结果、行业里的人准备接手的那一刻，这三个检查各自决定一件事：合同是否结构可审、发票算术是否成立、商品导出是否可上架。每个都是单个命令，从文件本身判定。</p>
<table><tr><th>检查清单</th><th>npm 包</th><th>搜索名词</th><th>它决定什么</th></tr>${rows}</table>
<h2>定位</h2>
<p>护城河不在深度——专业产品随时碾压深度。在：离线可跑、出口码接 CI、免费、host 路由与 CLI 调同一函数。定位是「专业人士的前五分钟」，不是「专业人士的替代」。通用的五个检查（哈希/引用/结构/表格/数字）在 <a href="${KIT}">dsh-verify-kit</a>。</p>
<small><a href="${REPO}">github.com/zjukop3/dsh-vertical-kit</a> · MIT · 18 tests</small>
<section class="install"><h2>在 DSH 中安装</h2><p>八件作品都在同一个 format 1 索引源里，从 npm registry 解析，装完即用。在「插件」启用「自定义插件索引」，添加 <code>https://zjukop3.github.io/dsh-review-outbox/plugins.json</code>，按名字搜索安装（本仓库三件：agreement-check / invoice-check / listing-check）。</p><p><a href="https://zjukop3.github.io/dsh-review-outbox/">索引源与全部收录说明</a></p></section>
</main></body></html>`
}

const root = resolve(import.meta.dirname, '..')
const indexNow = await readIndexNowConfig(root).catch(() => null)
await mkdir(resolve(root, 'site'), { recursive: true })
await writeFile(resolve(root, 'site/index.html'), home())
for (const check of CHECKS) {
  await mkdir(resolve(root, 'site', check.slug), { recursive: true })
  await writeFile(resolve(root, 'site', check.slug, 'index.html'), page(check))
}
const urls = [`${ORIGIN}/`, ...CHECKS.map(check => `${ORIGIN}/${check.slug}/`)]
await writeFile(resolve(root, 'site/robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`)
if (indexNow) await writeFile(resolve(root, `site/${indexNow.key}.txt`), `${indexNow.key}\n`)
await writeFile(resolve(root, 'site/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(loc => `  <url><loc>${esc(loc)}</loc></url>`).join('\n')}\n</urlset>\n`)
console.log(JSON.stringify({ ok: true, pages: urls.length }))
