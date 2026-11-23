// 提交前的入口检查：一份 awesome-dsh-plugin 目录条目 yaml 会不会被 CI 打回。
//
// 为什么值得单独一个检查：目录的 CI 只会说「形状不对」，而形状有十几条硬要求——文件名的
// 双下划线与短横、name 与 url 必须指同一个仓库、monorepo 子包要在 url 里写 /tree/<ref>/<path>
// 且 name 里写 #sub 且两者一致、category 必须是那 24 个之一、description 必须 en/zh 都有。
// 每一条都能在本地一秒判掉，而每一条都要在 PR 里来回一轮才能发现。
//
// 判据全部来自上游 contributing.md 的正文，不来自印象。上游改规则时这里要跟着改——所以
// CATEGORIES 与文件名规则在测试里各有两条断言（该收的收、该拒的拒）。

export const CATEGORIES = [
  'agi', 'ui', 'usage', 'theme', 'model', 'identity', 'session', 'memory', 'tools', 'wsl',
  'browser', 'vision', 'voice', 'docs', 'skill', 'workflow', 'git', 'notify', 'dev',
  'security', 'remote', 'market', 'fun',
]

export const KEYS = ['url', 'name', 'category', 'description', 'icon']
const REQUIRED = ['url', 'name', 'category', 'description']

const URL_SHAPE = /^https:\/\/github\.com\/([^/\s#]+)\/([^/\s#]+?)(?:\/tree\/([^/\s]+)(?:\/(.+?))?)?$/
const NAME_SHAPE = /^([^/\s#]+)\/([^/\s#]+)(?:#(\S+))?$/
// 占位符只认「整段还没写」的痕迹。第一版还匹配 `<…>` 与 `xxx`，把 license 条目里正常
// 提到「Copyright [yyyy] [name]」这种被检查对象的描述也判成了占位符——误报。
const PLACEHOLDER = /^\s*(TODO|TBD|FIXME)\b|lorem ipsum|^\s*待填|^\s*占位/i
const IMAGE = /\.(png|svg|jpe?g|webp|gif)$/i

/**
 * 这份条目支持的 YAML 形状：扁平键值 + 恰好一层 `description:` 子映射。
 * 手写一个解析器而不是引依赖，是因为这条 CLI 要能 `npx` 直跑，不该为四个标量和一层嵌套
 * 装一个 YAML 库。不支持的形状（列表、块标量、更深嵌套、制表符缩进）明确报错，
 * 而不是猜——猜错会让一份合法条目被误判，比不支持更糟。
 */
export function parseEntry(text) {
  const fields = new Map()
  const description = new Map()
  const problems = []
  let inDescription = false
  let line = 0
  for (const raw of String(text).split('\n')) {
    line += 1
    if (raw.trim() === '' || /^\s*#/.test(raw)) continue
    if (/^\s*-/.test(raw)) {
      problems.push({ kind: 'yaml-shape', line, message: '不支持列表（`- `）——条目是扁平键值' })
      continue
    }
    if (/\t/.test(raw)) {
      problems.push({ kind: 'yaml-shape', line, message: '缩进里不能用制表符' })
      continue
    }
    const indent = raw.match(/^\s*/)[0].length
    const body = raw.slice(indent)
    const match = body.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!match) {
      problems.push({ kind: 'yaml-shape', line, message: `这一行不是「键: 值」：${body.slice(0, 40)}` })
      continue
    }
    const [, key, restRaw] = match
    const rest = restRaw.trim()
    if (rest === '|' || rest === '>') {
      problems.push({ kind: 'yaml-shape', line, message: '不支持块标量（`|` / `>`）——用单行字符串' })
      continue
    }
    const unquote = value => {
      if (/^'.*'$/.test(value)) return value.slice(1, -1).replace(/''/g, "'")
      if (/^".*"$/.test(value)) return value.slice(1, -1).replace(/\\"/g, '"')
      return value
    }
    if (indent === 0) {
      inDescription = key === 'description' && rest === ''
      if (fields.has(key)) problems.push({ kind: 'duplicate-key', line, message: `键 ${key} 出现了两次——YAML 会静默取后一个` })
      fields.set(key, rest === '' ? '' : unquote(rest))
      continue
    }
    if (!inDescription || indent !== 2) {
      problems.push({ kind: 'yaml-shape', line, message: '只支持 description: 下面一层缩进；其它嵌套请摊平' })
      continue
    }
    if (description.has(key)) problems.push({ kind: 'duplicate-key', line, message: `description.${key} 出现了两次` })
    description.set(key, unquote(rest))
  }
  return { fields, description, problems }
}

/** 从文件名推出应有的 owner / repo / 子路径。`owner__repo--path-with-dashes.yml`。 */
export function expectedName(filename) {
  const base = String(filename).split('/').pop().replace(/\.ya?ml$/i, '')
  const [left, ...rest] = base.split('--')
  const [owner, repo] = left.split('__')
  if (!owner || !repo) return null
  return { owner, repo, path: rest.length > 0 ? rest.join('--') : null }
}

const cjk = text => (String(text).match(/[\u4e00-\u9fff]/g) ?? []).length

export function lintPluginEntry(text, options = {}) {
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const source = String(text ?? '')
  if (source.trim() === '') {
    add('error', 'empty', 0, '条目是空的——没有 url、name、category 的 yaml 交上去只会被拒')
    return finish(findings, {})
  }

  const { fields, description, problems } = parseEntry(source)
  for (const problem of problems) {
    add(problem.kind === 'duplicate-key' ? 'error' : 'error', problem.kind, problem.line, problem.message)
  }

  for (const key of fields.keys()) {
    if (!KEYS.includes(key)) add('error', 'unknown-key', 0, `不认识的键 ${key}——上游只认 ${KEYS.join(' / ')}`)
  }
  for (const key of REQUIRED) {
    // description 是嵌套映射：fields 里那条是空串，内容在 description 里。判「有没有」要看
    // 两边——第一版只看 fields，于是四份真实条目全被判成「缺少 description」。
    const present = key === 'description'
      ? description.size > 0
      : fields.has(key) && String(fields.get(key)).trim() !== ''
    if (!present) add('error', 'missing-key', 0, `缺少 ${key}`)
  }

  const url = fields.get('url') ?? ''
  const name = fields.get('name') ?? ''
  const urlMatch = url ? url.match(URL_SHAPE) : null
  if (url) {
    if (!urlMatch) {
      add('error', 'url-shape', 0, 'url 必须是 https://github.com/<owner>/<repo>，子包再加 /tree/<ref>/<path>；不要 .git、结尾斜杠或 blob/')
    } else if (/\/$/.test(url)) {
      add('error', 'url-shape', 0, 'url 结尾不要斜杠')
    } else if (/\.git$/.test(urlMatch[2])) {
      add('error', 'url-shape', 0, 'url 不要带 .git——评审点进去的是仓库页，不是克隆地址')
    }
  }

  const nameMatch = name ? name.match(NAME_SHAPE) : null
  if (name && !nameMatch) add('error', 'name-shape', 0, 'name 必须是 owner/repo 或 owner/repo#sub')
  if (urlMatch && nameMatch) {
    const [, urlOwner, urlRepo, , urlPath] = urlMatch
    const [, owner, repo, sub] = nameMatch
    if (owner !== urlOwner || repo !== urlRepo) {
      add('error', 'name-shape', 0, `name 指向 ${owner}/${repo}，url 指向 ${urlOwner}/${urlRepo}——评审会看这两个是不是同一个仓库`)
    }
    if (urlPath && !sub) add('error', 'sub-path', 0, 'url 指到子目录时必须用 name: owner/repo#子包名')
    // #sub 写的是包目录名，不是整条路径：真实条目是
    //   url: …/tree/main/packages/dsh-adr-check + name: …#dsh-adr-check
    // 第一版拿整条 packages/dsh-adr-check 去比，把四份已合并的条目全判成不一致。
    const lastSegment = urlPath ? urlPath.split('/').filter(Boolean).pop() : null
    if (sub && lastSegment && sub !== lastSegment) {
      add('error', 'sub-path', 0, `name 里的 #${sub} 与 url 最后一段子目录 ${lastSegment} 不一致`)
    }
    if (sub && !urlPath) add('error', 'sub-path', 0, 'name 里有 #子包，url 却没有 /tree/<ref>/<path>——评审点不进那个目录')
  }

  const category = fields.get('category')
  if (category && !CATEGORIES.includes(category)) {
    add('error', 'category', 0, `category「${category}」不在上游的 ${CATEGORIES.length} 个取值里：${CATEGORIES.join(' ')}`)
  }

  for (const lang of ['en', 'zh']) {
    if (!description.has(lang) || description.get(lang).trim() === '') {
      add('error', 'description-keys', 0, `缺少 description.${lang}——上游要求两种语言都有`)
    }
  }
  for (const [lang, value] of description) {
    if (PLACEHOLDER.test(value)) add('error', 'description-placeholder', 0, `description.${lang} 里有占位符（TODO / <…> / lorem）`)
  }
  const en = description.get('en') ?? ''
  const zh = description.get('zh') ?? ''
  if (en && en.length < 120) add('warn', 'description-thin', 0, `description.en 只有 ${en.length} 字符——一条说不清「它做什么」的条目，读者会跳过`)
  if (zh && cjk(zh) < 40) add('warn', 'description-thin', 0, `description.zh 只有 ${cjk(zh)} 个汉字——中文读者读到的信息量太少`)
  // 拿汉字数比英文字符数是不成立的：一个汉字承载的信息约等于一个英文词。真实条目
  // 78 个汉字对 264 个字符被判成「中文像占位」，而那是一条已合并的完整译文。
  const enWords = en.split(/\s+/).filter(Boolean).length
  if (enWords >= 20 && cjk(zh) < enWords * 0.6) add('warn', 'description-parity', 0, `description.zh 只有 ${cjk(zh)} 个汉字，en 有 ${enWords} 个词——中文那半像是占位`)

  const icon = fields.get('icon')
  if (icon) {
    if (!/^https:\/\//.test(icon)) add('warn', 'icon-shape', 0, 'icon 用绝对 https 地址——相对路径在目录页里解析不了')
    else if (!IMAGE.test(icon)) add('warn', 'icon-shape', 0, 'icon 的扩展名不是图片（png/svg/jpg/webp）')
  }

  // 规则 #7：纯聚合包不收录。yaml 里看不出来，但描述自己说了就算线索。
  const text7 = `${en} ${zh}`
  if (/bundle|aggregat|all-in-one|聚合|套件|一键安装/i.test(text7) && /install(s|ing)? (a )?(set|many|all)|装上一组|装一组|一次装/i.test(text7)) {
    add('warn', 'bundle-hint', 0, '描述像是在说「一次装一组别的插件」——上游第 7 条不收录纯聚合包；若它自己也有行为，写清那个行为')
  }

  // 文件名规则只对条目文件本身说话：路径不是 .yml/.yaml 时，那个名字跟目录里的要求无关
  // （示例跑测把 fixture 写成 .md，第一版在这里把临时路径当成条目文件名报了出来，
  // 于是嵌入的输出里带着一个随机临时目录，谁也复现不了）。
  const filename = options.filename && /\.ya?ml$/i.test(String(options.filename)) ? options.filename : undefined
  if (filename) {
    const expected = expectedName(filename)
    if (!expected) {
      add('error', 'filename', 0, `文件名 ${String(filename).split('/').pop()} 不符合 owner__repo.yml 或 owner__repo--path.yml`)
    } else if (urlMatch) {
      const [, urlOwner, urlRepo, , urlPath] = urlMatch
      const wantOwner = expected.owner
      const wantRepo = expected.repo.replace(/-/g, '-')
      const pathAsDashes = urlPath ? urlPath.replace(/\//g, '-') : null
      if (wantOwner !== urlOwner || wantRepo !== urlRepo || (pathAsDashes ?? null) !== (expected.path ?? null)) {
        const want = `${urlOwner}__${urlRepo}${pathAsDashes ? `--${pathAsDashes}` : ''}.yml`
        add('warn', 'filename', 0, `文件名应为 ${want}（当前 ${filename.split('/').pop()}）`)
      }
    }
  }

  return finish(findings, { fields, description })
}

function finish(findings, parsed) {
  const errors = findings.filter(finding => finding.level === 'error').length
  const warnings = findings.filter(finding => finding.level === 'warn').length
  findings.sort((a, b) => (a.level === b.level ? a.line - b.line : a.level === 'error' ? -1 : 1))
  return {
    ok: errors === 0,
    errors,
    warnings,
    findings,
    checked: {
      keys: parsed.fields ? parsed.fields.size : 0,
      languages: parsed.description ? parsed.description.size : 0,
    },
  }
}

export const name = 'plugin-entry-check'
export const inject = ['webServer']

export function apply(ctx, config = {}) {
  const prefix = config.path || '/plugin-entry-check/api'
  const send = (status, body) => ({
    statusCode: status,
    payload: body,
  })
  const handler = async (req, res) => {
    const reply = (status, body) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }
    try {
      if (req.method !== 'POST') return reply(405, { error: 'POST only' })
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      let text = typeof body.text === 'string' && body.text ? body.text : ''
      if (!text && typeof body.path === 'string') text = await (await import('node:fs/promises')).readFile(body.path, 'utf8')
      if (!text) return reply(400, { error: 'text or path is required' })
      return reply(200, lintPluginEntry(text, { filename: typeof body.filename === 'string' ? body.filename : undefined }))
    } catch (error) {
      return reply(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
  return send
}