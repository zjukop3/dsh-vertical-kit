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
<p><a href="./corpus/">这 ${CHECKS.length} 个检查的语料状况（哪些真有真实文件跑过）→</a></p>
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
const CORPUS_BODY = `<p>这里的 22 个检查，判定规则是不是「验证过」，取决于它在多少份<strong>真实文档</strong>上跑过。自己造的 fixture 只能证明&quot;我想到的情况它判对了&quot;，证明不了&quot;别人写的东西它不会误报&quot;。</p>
<p>下面这份表是诚实的自报：哪些检查有真实语料，哪些只有我编的样例。</p>
<h2>有真实语料的（九条）</h2>
<table><tr><th>检查</th><th>语料</th><th>份数</th><th>第一次跑出的问题</th></tr><tr><td>onboarding-check</td><td>本项目的 README</td><td>22</td><td>20 个报 <code>success-missing</code>——它们都写了真实输出，只是标题叫「真实输入输出」</td></tr><tr><td>release-notes-check</td><td>三个仓库的 CHANGELOG</td><td>3</td><td>全部报 <code>version-missing</code>——<code>## [1.2.0] - 2026-11-17</code> 是 Keep a Changelog 的官方写法</td></tr><tr><td>license-check</td><td>每个包的 LICENSE</td><td>21</td><td>无</td></tr><tr><td>commit-msg-check</td><td>三个仓库的提交历史</td><td>120</td><td>83% 报 <code>type-missing</code>——那是团队约定不是缺陷；56% 主题超 72 字，那是真问题</td></tr><tr><td>pr-description-check</td><td>已合并的目录 PR 正文</td><td>19</td><td>19/19 报缺 what/why/test，其实三个问题都用散文答了；另有 2 个被误判&quot;声明了破坏性变更&quot;</td></tr><tr><td>adr-check</td><td>本项目的决策记录</td><td>3</td><td><code>consequence</code> 只看项目符号，把写在段落行上的「好处：」「代价：」判成未标注</td></tr><tr><td>incident-report-check</td><td>事故复盘</td><td>1</td><td>无</td></tr><tr><td>ops-runbook-check</td><td>四份 runbook</td><td>4</td><td>两份用 <code>## 3.</code> 编号标题的 runbook 被报&quot;完全没有编号步骤&quot;</td></tr><tr><td>api-doc-check</td><td>本项目 host 路由的接口参考</td><td>1</td><td>文档写对了，但探针发现六处形状写错——那是文档的错，不是检查的错</td></tr><tr><td>dockerfile-check</td><td><strong>第三方</strong> Dockerfile</td><td>2</td><td>其中一个以 root 收尾（真缺陷，不是误报）；另一个干净</td></tr><tr><td>env-example-check</td><td><strong>第三方</strong> .env.example</td><td>1</td><td>把文档里的 <code>https://remote.example.edu/...</code> 判成真值——保留示例域名是占位符，这是误报</td></tr></table>
<h2>只有自造样例的（十一条）</h2>
<p>这些检查的每条规则都在测试里被观察到两个方向——坏文档会报、好文档沉默——但那个&quot;好文档&quot;是我写的。<strong>没有陌生人的真实文件跑过它们。</strong></p>
<ul>
<li>agreement-check（合同）</li>
<li>invoice-check（发票）</li>
<li>listing-check（商品信息）</li>
<li>meeting-notes-check（会议纪要）</li>
<li>resume-check（简历）</li>
<li>weekly-report-check（周报）</li>
<li>bug-report-check（缺陷报告）</li>
<li>test-report-check（测试报告）</li>
<li>spec-doc-check（需求文档）</li>
<li>handover-check（交接单）</li>
<li>expense-claim-check（报销单）</li>
</ul>
<p>这十一个的共同点：它们的正确样例长什么样，是我按自己的理解定的。真实世界里的合同、简历、周报会长成什么样，比我能想到的更杂。</p>
<h2>为什么这很重要</h2>
<p>上面十一条里有九条，是<strong>同一个缺陷</strong>：规则要求某一种写法（类型前缀、某个小标题、方括号版本号、项目符号），而真实文档用的是另一种同样合法的写法，于是对每一份真实文档都报错。</p>
<p>这个缺陷在自造 fixture 上永远不会暴露——因为我编的 fixture 里，&quot;正确&quot;和&quot;被检查器接受&quot;是同一件事。只有把检查器指向别人的文件，两者才会分开。</p>
<h2>如果你手上有一份</h2>
<p>任意一条判断错了——多报了不该报的、或漏了该报的——请开一个 <a href="https://github.com/zjukop3/dsh-vertical-kit/issues/new?template=corpus-report.yml">语料报告</a>，附上<strong>脱敏后</strong>的原文片段和 CLI 的原样输出。</p>
<p>提交前请把真名、公司、金额、地址、证件号、联系方式、内网域名替换成占位符。这份内容会成为那条规则的回归测试，所以它会进仓库、会公开。</p>
<p>这十一类里每补上一份真实语料，就意味着少一分&quot;这工具装上去第一天就误报&quot;的风险。这件事我自己做不到——我没有别人的合同、别人的简历、别人的报销单。</p>`

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
// A machine-readable manifest. Every other surface here is for a person: the
// pages explain, the compare table helps choose. An agent or a script needs the
// set as data — what exists, what each decides, which file it wants, and how to
// call it — without parsing HTML.
const manifest = {
  name: 'dsh-vertical-kit',
  repository: REPO,
  origin: ORIGIN,
  description: 'Industry-scenario deliverable checks for DeepSeek Harness. One verb each, deterministic, no model calls, CLI and host route share one implementation.',
  license: 'MIT',
  compare: `${ORIGIN}/compare/`,
  generic: KIT,
  checks: CHECKS.map(check => ({
    name: check.npm,
    cli: check.cli,
    slug: check.slug,
    noun: check.noun,
    title: check.title,
    decides: check.decides,
    description: check.description,
    rules: check.rules.map(([rule, meaning]) => ({ rule, meaning })),
    usage: check.usage,
    page: `${ORIGIN}/${check.slug}/`,
    route: `POST /${check.slug}/api`,
    scope: check.note,
  })),
}
await writeFile(resolve(root, 'site/checks.json'), JSON.stringify(manifest, null, 2) + '\n')

await mkdir(resolve(root, 'site', 'compare'), { recursive: true })
await writeFile(resolve(root, 'site', 'compare', 'index.html'), compare())
// The corpus page. Every check in this kit claims its rules were tested; this
// page says which ones were tested against documents strangers wrote, and which
// were only tested against fixtures this project made up. Nine of the eleven
// same-shape defects in this kit's history were found the first time a check met
// a real document, so the gap is the honest disclosure that matters most.
function corpusPage() {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>每条规则的语料状况 · dsh-vertical-kit</title><meta name="description" content="22 个检查里，九个有真实语料、十一个只有自造样例。这份自报说明每条规则的验证程度，以及为什么这件事决定了工具装上去第一天会不会误报。"><meta name="robots" content="index,follow"><link rel="canonical" href="${esc(`${ORIGIN}/corpus/`)}"><style>${styles}</style></head><body><main>
<p class="eyebrow">DSH VERTICAL KIT · CORPUS STATUS</p>
<h1>每条规则的语料状况</h1>
${CORPUS_BODY}
<p><a href="./">← 回到 ${CHECKS.length} 个检查一览</a></p>
</main></body></html>`
}
await mkdir(resolve(root, 'site', 'corpus'), { recursive: true })
await writeFile(resolve(root, 'site', 'corpus', 'index.html'), corpusPage())
const urls = [`${ORIGIN}/`, `${ORIGIN}/compare/`, `${ORIGIN}/corpus/`, ...CHECKS.map(check => `${ORIGIN}/${check.slug}/`)]
await writeFile(resolve(root, 'site/robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`)
if (indexNow) await writeFile(resolve(root, `site/${indexNow.key}.txt`), `${indexNow.key}\n`)
await writeFile(resolve(root, 'site/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(loc => `  <url><loc>${esc(loc)}</loc></url>`).join('\n')}\n</urlset>\n`)
const llms = [
  `# dsh-vertical-kit`,
  ``,
  `> Industry-scenario checks for deliverables an agent produced and a person is about to accept. Each is one verb, each runs without DSH, each returns the same JSON from the CLI and the host route.`,
  ``,
  `- ${ORIGIN}/compare/: All ${CHECKS.length} checks in one table — which one applies to which file, and how many rules each carries.`,
  `- ${ORIGIN}/checks.json: The same set as machine-readable JSON — name, cli, noun, decides, rules, usage, page and HTTP route per check.`,
  ...CHECKS.map(check => `- ${ORIGIN}/${check.slug}/: ${check.title} — ${check.description}`),
  ``,
  `- ${REPO}: Public source code, ${CHECKS.length} packages, one implementation per check shared by the CLI and the host route.`,
].join('\n')
await writeFile(resolve(root, 'site/llms.txt'), llms)
console.log(JSON.stringify({ ok: true, pages: urls.length }))
