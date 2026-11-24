// A privacy notice is read by someone deciding whether to hand over their data,
// and by an auditor deciding whether the notice is answerable at all. Five
// questions have to be answerable from the text: what is collected, what it is
// used for, how long it is kept, who else sees it, and who to ask. Two more make
// it usable: the effective date and how to exercise a right.
//
// Retention is the rule this package exists for. Almost every notice says what
// it collects and why, and then goes quiet about how long — which is the exact
// question that decides whether "delete my account" means anything.
//
// Every "we do not collect / we do not keep" statement is accepted as an
// answer. A notice that collects nothing is not missing a section; it is making
// a claim, and the claim is the content.

export const name = 'privacy-notice-check'
export const inject = ['webServer']

// 真实文档大量用 YAML frontmatter 给标题（GitHub 的 site-policy、Docusaurus、Jekyll
// 都是这个形状）。只认 `# ` 会把三份真实隐私声明全部判成「没有标题」。
// 拆成函数而不是一条正则：一条正则同时表达「有 frontmatter 标题」和「有一级标题」
// 会把两种情况一起写错（第一版就写错了，`\A` 在 JS 里根本不是锚点）。
export function titleOf(text) {
  const source = String(text).replace(/^\uFEFF/, '')
  const front = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (front && /^title:\s*\S+/m.test(front[1])) return 'frontmatter'
  // 一行锚点必须带 m：带 frontmatter 的文档第一行是 `---`，H1 在第五行左右，
  // `/^#/` 不带 m 永远不匹配（resume、spec-doc、migration-guide 三处都踩过，这是第四处）。
  if (/^#\s+\S/m.test(source)) return 'heading'
  return null
}

const heading = words => new RegExp(`(?:^|\\n)#{1,6}[^\\n]*(?:${words})`, 'i')
const label = words => new RegExp(`^[^\\n]*(?:${words})\\s*[：:]`, 'i')

// 真实写法的三种：information we collect、personal data that we process、data we collect。
const DATA_HEADING = heading('收集|信息收集|数据类别|information (?:that )?we collect|data (?:that )?we (?:collect|process)|personal data[^\n]{0,24}(?:collect|process|hold)')
const DATA_LABEL = label('我们收集|收集的信息|收集的数据')
const DATA_NONE = /(?:不收集|不会收集|不采集|we do not collect|we don't collect)/i

const PURPOSE_HEADING = heading('目的|用途|为什么收集|how we use|purpose')
const PURPOSE_LABEL = label('使用目的|收集目的|用途|purpose')

const RETENTION_HEADING = heading('保留|保存期|留存|retention')
const RETENTION_LABEL = label('保留期限|保存期限|保留时间|retention')
const RETENTION_NONE = /(?:不保留|不留存|不保存|不会保留|we do not (?:retain|keep))/i

// GitHub 的写法是 How and Why We Disclose Personal Data——disclose 就是共享。
const SHARING_HEADING = heading('共享|第三方|对外提供|委托处理|sharing|third part|disclos|subprocessor')
const SHARING_LABEL = label('共享|第三方|sharing|disclos')

const CONTACT_HEADING = heading('联系|如何联系我们|contact')
const CONTACT_LABEL = label('联系|邮箱|contact')
const CONTACT_INLINE = /(?:[\w.+-]+@[\w-]+\.[\w.]+)/

const EFFECTIVE = /(?:生效日期|生效时间|更新日期|最后更新|effective date|last updated)/i
// 权利必须被写成权利：一节，或「你有权…」这种句式。
// 早先这里是裸词表（访问|删除|…），结果保留期那句「账号关闭后 30 天内删除」
// 把 rights-missing 永久盖住了——一个永远不响的规则等于没有这条规则。
const RIGHTS_HEADING = heading('权利|隐私权|your rights')
const RIGHTS_LABEL = label('权利|rights')
const RIGHTS_ACTION = /(?:你有权|您可以|你可以|用户可以|用户有权|you (?:can|may))[^\n]{0,20}?(?:访问|更正|删除|撤回|注销|导出|opt out)/i

export function lintPrivacyNotice(text, rules = {}) {
  const requireRights = rules.requireRights ?? false
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')
  const any = (...patterns) => lines.some(line => patterns.some(pattern => pattern.test(`\n${line}`) || pattern.test(line)))

  if (!titleOf(text)) add('error', 'title-missing', 1, '没有标题（认得：`# 标题`，或 frontmatter 里的 `title:`）——声明要有个能认出来的名字')

  if (!any(DATA_HEADING, DATA_LABEL, DATA_NONE)) {
    add('error', 'data-missing', 0, '没有说明收集什么（认得：## 我们收集的信息、收集的信息：…，或不收集）——这是读者第一个要问的')
  }

  if (!any(PURPOSE_HEADING, PURPOSE_LABEL)) {
    add('error', 'purpose-missing', 0, '没有说明用途（认得：## 使用目的、用途：…、## How we use it）——「为了提供服务」和「什么都能干」是两种声明')
  }

  if (!any(RETENTION_HEADING, RETENTION_LABEL, RETENTION_NONE)) {
    add('error', 'retention-missing', 0, '没有保留期限（认得：## 保留期限、保留时间：30 天，或不保留）——没有期限，「注销账号」就不等于数据会消失')
  }

  if (!any(SHARING_HEADING, SHARING_LABEL)) {
    add('error', 'sharing-missing', 0, '没有第三方共享说明（认得：## 共享、## 第三方、共享：…）——散文里提到「第三方」不算声明，读者指不出哪一句是承诺')
  }

  if (!any(CONTACT_HEADING, CONTACT_LABEL, CONTACT_INLINE)) {
    add('error', 'contact-missing', 0, '没有联系方式（认得：## 联系我们、联系邮箱：…、privacy@example.com）——没有渠道，行使权利就是空话')
  }

  if (!lines.some(line => EFFECTIVE.test(line))) {
    add('warn', 'effective-date-missing', 0, '没有生效或更新日期（认得：生效日期：2026-11-01、last updated）——不知道版本的声明，无法判断哪一版约束我')
  }

  if (!any(RIGHTS_HEADING, RIGHTS_LABEL, RIGHTS_ACTION)) {
    const level = requireRights ? 'error' : 'warn'
    add(level, 'rights-missing', 0, '没有用户权利说明（认得：## 你的权利、你有权访问/删除…、Your rights）——只说收集不说权利，读者只能猜自己能要求什么')
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked: { lines: lines.length },
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/privacy-notice-check/api'
  const handler = async (req, res) => {
    const send = (status, body) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }
    try {
      if (req.method !== 'POST') return send(405, { error: 'POST only' })
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      const text = typeof body.text === 'string' && body.text ? body.text : body.path ? await (await import('node:fs/promises')).readFile(body.path, 'utf8') : ''
      if (!text) return send(400, { error: 'text or path is required' })
      return send(200, lintPrivacyNotice(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}