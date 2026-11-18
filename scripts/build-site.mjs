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
<p>Agent 已经产出结果、有人准备接手的那一刻，每个检查各自决定一件事：这份文件是否交代了它该交代的东西。${CHECKS.length} 个检查覆盖二十种交付物——合同、发票、商品信息、会议纪要、简历、周报、发布说明、缺陷报告、接口文档、测试报告、提交信息、PR 描述、需求文档、架构决策、Dockerfile、.env 示例、LICENSE、事故复盘、运维手册、上手指南。每个都是单个命令，从文件本身判定，不调用模型。</p>
<table><tr><th>检查清单</th><th>npm 包</th><th>搜索名词</th><th>它决定什么</th></tr>${rows}</table>
<p><a href="./compare/">全部 ${CHECKS.length} 个检查一览 →</a>（按文件类型选：合同/发票/纪要/简历/Dockerfile/LICENSE…）</p>
<h2>定位</h2>
<p>护城河不在深度——专业产品随时碾压深度。在：离线可跑、出口码接 CI、免费、host 路由与 CLI 调同一函数。定位是「专业人士的前五分钟」，不是「专业人士的替代」。通用的五个检查（哈希/引用/结构/表格/数字）在 <a href="${KIT}">dsh-verify-kit</a>。</p>
<small><a href="${REPO}">github.com/zjukop3/dsh-vertical-kit</a> · MIT · ${CHECKS.length} 个检查 · 全部免费</small>
<section class="install"><h2>在 DSH 中安装</h2><p>本仓库的 ${CHECKS.length} 个检查与 review-outbox、dsh-verify-kit 的五个通用检查共用同一个 format 1 索引源，从 npm registry 解析，装完即用。在「插件」启用「自定义插件索引」，添加 <code>https://zjukop3.github.io/dsh-review-outbox/plugins.json</code>，按名字搜索安装——不知道用哪个就先看 <a href="./compare/">对照表</a>。</p><p><a href="https://zjukop3.github.io/dsh-review-outbox/">索引源与全部收录说明</a></p></section>
</main></body></html>`
}

// The comparison page: at seventeen checks a reader cannot hold the set in
// their head, and guessing which one applies is how a tool gets ignored. One
// table, generated from the same CHECKS data the individual pages use, so it
// cannot drift from them.
function compare() {
  const rows = CHECKS.map(check => {
    const url = `${ORIGIN}/${check.slug}/`
    const ruleCount = check.rules.length
    return `<tr><td><a href="${esc(url)}">${esc(check.npm)}</a></td><td>${esc(check.title)}</td><td>${esc(check.noun)}</td><td>${esc(check.decides)}</td><td>${ruleCount}</td></tr>`
  }).join('')
  const nav = CHECKS.map(entry => `<a href="../${entry.slug}/">${entry.npm}</a>`).join('')
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>全部 ${CHECKS.length} 个检查一览 · dsh-vertical-kit</title><meta name="description" content="dsh-vertical-kit 的 ${CHECKS.length} 个交付检查对照表：每个检查判定什么、绑定哪个搜索名词、有多少条规则。用这张表选你要的那一个。"><meta name="robots" content="index,follow"><link rel="canonical" href="${esc(`${ORIGIN}/compare/`)}"><style>${styles}</style></head><body><main>
<p class="eyebrow">DSH VERTICAL KIT · ${CHECKS.length} CHECKS</p>
<h1>全部 ${CHECKS.length} 个检查一览</h1>
<p>每个检查只做一件事：从一份文件本身判定一组可判定的缺陷，说出第几行、缺什么。它们不调用模型，不联网判定，CLI 与 host 路由调同一函数。用这张表选你要的那一个——选错了通常是名词对不上，而不是功能不够。</p>
<table><tr><th>包</th><th>检查清单</th><th>搜索名词</th><th>它决定什么</th><th>规则数</th></tr>${rows}</table>
<h2>怎么选</h2>
<p>先看你手上是什么文件：</p>
<ul>
<li>合同 → agreement-check；发票 → invoice-check；商品导出表 → listing-check</li>
<li>会议纪要 → meeting-notes-check；简历 → resume-check；周报 → weekly-report-check</li>
<li>发布说明 → release-notes-check；缺陷报告 → bug-report-check；接口文档 → api-doc-check</li>
<li>测试报告 → test-report-check；提交信息 → commit-msg-check；PR 描述 → pr-description-check</li>
<li>Dockerfile → dockerfile-check；.env.example → env-example-check；LICENSE → license-check</li>
<li>事故复盘 → incident-report-check；运维手册 → ops-runbook-check</li>
</ul>
<p>通用缺陷（交付文件的哈希、报告引用、文档结构、Markdown 表格、数字写法）在 <a href="${KIT}">dsh-verify-kit</a>，不在这个对照表里。</p>
<h2>共同约束</h2>
<ul>
<li><strong>一条发现一行。</strong>每条都带行号；没有行号的建议没法动手改。</li>
<li><strong>只判可判定的。</strong>需要判断力的事不写成规则；需要判断力的事也不能假装判定了。</li>
<li><strong>warn 与 error 分开。</strong>error 是「这份文件没说清一件事」，warn 是「说了但值得看一眼」，多数 warn 在信息里写明什么情况下可以忽略。</li>
<li><strong>出口码 0/1/2</strong>：干净、有发现、用法或读文件错误。可直接接 CI。</li>
</ul>
<nav class="nav">${nav}</nav>
<small><a href="${REPO}">github.com/zjukop3/dsh-vertical-kit</a> · 本页由 <code>scripts/build-site.mjs</code> 从 <code>scripts/checks-data.mjs</code> 生成，与各检查页同源</small>
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
await mkdir(resolve(root, 'site', 'compare'), { recursive: true })
await writeFile(resolve(root, 'site', 'compare', 'index.html'), compare())
const urls = [`${ORIGIN}/`, `${ORIGIN}/compare/`, ...CHECKS.map(check => `${ORIGIN}/${check.slug}/`)]
await writeFile(resolve(root, 'site/robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`)
if (indexNow) await writeFile(resolve(root, `site/${indexNow.key}.txt`), `${indexNow.key}\n`)
await writeFile(resolve(root, 'site/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(loc => `  <url><loc>${esc(loc)}</loc></url>`).join('\n')}\n</urlset>\n`)
const llms = [
  `# dsh-vertical-kit`,
  ``,
  `> Industry-scenario checks for deliverables an agent produced and a person is about to accept. Each is one verb, each runs without DSH, each returns the same JSON from the CLI and the host route.`,
  ``,
  `- ${ORIGIN}/compare/: All ${CHECKS.length} checks in one table — which one applies to which file, and how many rules each carries.`,
  ...CHECKS.map(check => `- ${ORIGIN}/${check.slug}/: ${check.title} — ${check.description}`),
  ``,
  `- ${REPO}: Public source code, ${CHECKS.length} packages, one implementation per check shared by the CLI and the host route.`,
].join('\n')
await writeFile(resolve(root, 'site/llms.txt'), llms)
console.log(JSON.stringify({ ok: true, pages: urls.length }))
