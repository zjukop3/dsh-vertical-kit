// Builds the crawlable site for the three industry checks. Each page is bound
// to the noun a person in that trade would search when they have the problem:
// 合同、发票、商品信息. The rules come from the same comparisons the tests
// enforce, so the page cannot drift from the tool.

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ORIGIN = process.env.PUBLIC_ORIGIN || 'https://zjukop3.github.io/dsh-vertical-kit'
const REPO = 'https://github.com/zjukop3/dsh-vertical-kit'
const KIT = 'https://zjukop3.github.io/dsh-verify-kit/'

const CHECKS = [
  {
    slug: 'agreement-check',
    npm: 'dsh-agreement-check',
    cli: 'agreement-check',
    noun: '合同检查 / 合同审查清单',
    title: '合同结构检查清单',
    description: '合同交给法务之前，先把结构定下来：甲乙方写没写、日期有没有锚、大写金额和数字对不对得上、签署栏、争议解决、违约责任。每条发现带行号，可接 CI。',
    decides: '这份合同在结构上是否可审',
    rules: [
      ['party-a / party-b', '没有「甲方：/乙方：」行，或名称为空 → error，报行号'],
      ['date', '全文无日期 → error；有日期但没有「签订/签署日期」字样 → warn'],
      ['amount-uppercase', '有数字金额但全文没有大写金额 → error'],
      ['amount-mismatch', '大写金额与所有数字金额都对不上 → error，报两边的值'],
      ['amount-ambiguous', '出现多个大写金额 → warn（自动比对仅在恰好一个时进行）'],
      ['signature', '没有「甲方（盖章）/乙方（盖章）」式签署栏 → error'],
      ['dispute', '没有争议解决条款（仲裁/诉讼/管辖）→ error'],
      ['breach', '没有违约责任条款 → error'],
      ['term', '没有期限条款 → warn'],
    ],
    usage: [
      'npx agreement-check contract.md --json',
      'npx agreement-check contract.md --warnings-fail',
    ],
    note: '大写金额解析器按 GB 习惯读 壹贰叁…拾佰仟万亿元角分整，支持「拾万元整」的 leading 拾 和 角分小数；解析不了的串返回 null 并计入歧义，不会编一个数出来。',
  },
  {
    slug: 'invoice-check',
    npm: 'dsh-invoice-check',
    cli: 'invoice-check',
    noun: '发票检查 / 发票校验',
    title: '发票字段检查清单',
    description: '发票不需要懂业务就能核对的部分：统一社会信用代码字符集、不含税+税额=价税合计的勾稽、大写金额与小写一致、发票号码位数。容差默认 0.02，可调。',
    decides: '发票上能从文本判定的算术与格式是否成立',
    rules: [
      ['credit-code', '18 位统一社会信用代码字符集校验（数字 + A-HJ-NPQRTUWXY，排除 I/O/S/V/Z）→ error'],
      ['invoice-number', '发票号码 20 位（数电票）或 8 位（纸质票）之外 → warn'],
      ['amount-sum', '不含税 + 税额 ≠ 价税合计（超出容差）→ error，报三项的值'],
      ['amount-partial', '勾稽三项缺一 → warn，点名缺哪个'],
      ['amount-uppercase', '大写金额与价税合计不一致 → error'],
      ['amount-ambiguous', '出现多个大写金额 → warn'],
      ['buyer / seller', '没有购买方/销售方名称栏 → error'],
    ],
    usage: [
      'npx invoice-check invoice.txt --json',
      'npx invoice-check invoice.txt --tolerance 0.02',
    ],
    note: '勾稽是发票自己的算术，不是税务合规：税率是否适用、抬头是否对，都不在这五个判定里。',
  },
  {
    slug: 'listing-check',
    npm: 'dsh-listing-check',
    cli: 'listing-check',
    noun: '电商商品信息检查 / listing 检查',
    title: '电商商品信息检查清单',
    description: '商品导出表（CSV/JSON）交付或上架前的检查：标题长度边界、关键词堆砌、价格有效性与边界、SKU 完整性与重复。每条发现报行号，边界可配置。',
    decides: '商品导出表是否达到可上架的结构卫生',
    rules: [
      ['title-short / title-long', '标题字符数越界（默认 10–60，可配）→ error，报行号与字数'],
      ['title-stuffing', '同一关键词连写三遍或分隔出现三次以上 → warn，报词与次数'],
      ['title-missing', '没有标题列或该行为空 → error'],
      ['price-invalid', '价格不是 ≥ 0.01 的数字 → error'],
      ['price-high', '价格超过上限（--max-price 配置）→ warn'],
      ['sku-missing / sku-empty', 'SKU 列缺失或为空 → error'],
      ['sku-duplicate', 'SKU 与更早的行重复 → error，报两行行号'],
    ],
    usage: [
      'npx listing-check listings.csv --json',
      'npx listing-check listings.csv --min-title 10 --max-title 60 --max-price 9999',
    ],
    note: '堆砌检测两种形态都认：连写（手机支架手机支架手机支架）和分隔重复；单字重复在中文标题里是常态，永不计入。认得的列名：标题 title/商品名称/名称，价格 price/售价，SKU sku/编码/货号。',
  },
]

const styles = 'body{max-width:840px;margin:6vh auto;padding:24px;background:#fafaf8;color:#0a0a0a;font:16px/1.7 system-ui,sans-serif}main{border-top:8px solid #b8860b}h1{font-size:clamp(30px,5.5vw,48px);font-weight:250;line-height:1.15;margin-bottom:16px}h2{font-size:22px;font-weight:500;margin-top:36px}p,li,td,th{color:#3d3d3d}a{color:#002fa7}code{font:.9em/1.5 ui-monospace,monospace;background:#f0f0ee;padding:2px 5px;border-radius:3px}pre{padding:14px;overflow:auto;background:#0a0a0a;color:#fff}pre code{background:none;color:inherit;padding:0}table{border-collapse:collapse;width:100%;font-size:14px;margin:16px 0}th,td{border:1px solid #d4d4d2;padding:9px 11px;text-align:left;vertical-align:top}th{background:#f0f0ee}.eyebrow{font:12px/1.4 ui-monospace,monospace;letter-spacing:.12em;color:#b8860b}.nav{margin:24px 0;font-size:14px}.nav a{margin-right:14px}.limit{margin-top:28px;padding:14px 18px;background:#f0f0ee;border-left:4px solid #b8860b}small{display:block;margin-top:32px;color:#737373}@media(max-width:600px){body{margin:2vh auto;padding:18px}}'

const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function page(check) {
  const url = `${ORIGIN}/${check.slug}/`
  const rules = check.rules
    .map(([rule, meaning]) => `<tr><td><code>${esc(rule)}</code></td><td>${esc(meaning)}</td></tr>`)
    .join('')
  const commands = check.usage.map(command => `<pre><code>${esc(command)}</code></pre>`).join('')
  const nav = CHECKS.map(entry => `<a href="../${entry.slug}/">${entry.npm}</a>`).join('')
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
</main></body></html>`
}

const root = resolve(import.meta.dirname, '..')
await mkdir(resolve(root, 'site'), { recursive: true })
await writeFile(resolve(root, 'site/index.html'), home())
for (const check of CHECKS) {
  await mkdir(resolve(root, 'site', check.slug), { recursive: true })
  await writeFile(resolve(root, 'site', check.slug, 'index.html'), page(check))
}
const urls = [`${ORIGIN}/`, ...CHECKS.map(check => `${ORIGIN}/${check.slug}/`)]
await writeFile(resolve(root, 'site/robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`)
await writeFile(resolve(root, 'site/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(loc => `  <url><loc>${esc(loc)}</loc></url>`).join('\n')}\n</urlset>\n`)
console.log(JSON.stringify({ ok: true, pages: urls.length }))
