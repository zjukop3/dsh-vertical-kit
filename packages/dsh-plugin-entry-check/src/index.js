// 提交前的入口检查：一份 awesome-dsh-plugin 目录条目 yaml 会不会被 CI 打回。
//
// 为什么值得单独一个检查：目录的 CI 只会说「形状不对」，而形状有十几条硬要求——文件名的
// 双下划线与短横、name 与 url 必须指同一个仓库、monorepo 子包要在 url 里写 /tree/<ref>/<path>
// 且 name 里写 #sub 且两者一致、category 必须是那 24 个之一、description 必须 en/zh 都有。
// 每一条都能在本地一秒判掉，而每一条都要在 PR 里来回一轮才能发现。
//
// 判据全部来自上游 contributing.md 的正文，不来自印象。上游改规则时这里要跟着改——所以
// CATEGORIES 与文件名规则在测试里各有两条断言（该收的收、该拒的拒）。

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const CATEGORIES = [
  'agi', 'ui', 'usage', 'theme', 'model', 'identity', 'session', 'memory', 'tools', 'wsl',
  'browser', 'vision', 'voice', 'docs', 'skill', 'workflow', 'git', 'notify', 'dev',
  'security', 'remote', 'market', 'fun',
]

// tarball 是上游 documented 的可选字段（不发 npm 时指向 GitHub Release 的预构建包），
// 我的第一版没把它列进来，于是 160 份已合并的真实条目里有 35 份被判「不认识的键」。
export const KEYS = ['url', 'name', 'category', 'description', 'icon', 'tarball']
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
  let target = null // { map, key, indent, block: null | '|' | '>', parts: [] }

  const unquote = value => {
    if (/^'.*'$/s.test(value)) return value.slice(1, -1).replace(/''/g, "'")
    if (/^".*"$/s.test(value)) return value.slice(1, -1).replace(/\\"/g, '"')
    return value
  }
  // 引号没在本行闭合 = 跨行标量。
  const openQuote = value => {
    const first = value.trim()[0]
    if (first !== "'" && first !== '"') return false
    const trimmed = value.trim()
    const closes = trimmed.length > 1 && trimmed.endsWith(first)
    return !closes
  }
  const flush = () => {
    if (!target) return
    const separator = target.block === '|' ? '\n' : ' '
    // 块标量按实际换行保留（`|`），折叠标量按 YAML 的规则折成空格（`>`），
    // 纯文本续行也用空格——合起来才是「描述里那个字符串」。
    const joined = target.parts.map(part => part.trim()).filter(part => part !== '').join(separator)
    // 跨行引号标量落盘时要摘掉引号，否则值里带着 `'`，后面的句号/占位符判据全部跟着错。
    const value = target.quoted ? unquote(joined) : joined
    setValue(target.map, target.key, value, target.line)
    target = null
  }
  const setValue = (map, key, value, line) => {
    if (map.has(key)) problems.push({ kind: 'duplicate-key', line, message: `${key} 出现了两次——YAML 会静默取后一个` })
    map.set(key, value)
  }

  let line = 0
  // Windows 提交的条目是 CRLF：`.` 不匹配 `\r`，`$` 也就永远落不到行尾，
  // 结果是整份条目每一行都被判「不是键: 值」。160 份真实条目里就有这么一份。
  for (const raw of String(text).split(/\r?\n/)) {
    line += 1
    if (/\t/.test(raw)) {
      problems.push({ kind: 'yaml-shape', line, message: '缩进里不能用制表符' })
      continue
    }
    if (raw.trim() === '') {
      // 块标量里的空行是内容的一部分，其余位置的空行只是分隔。
      if (target?.block) target.parts.push('')
      continue
    }
    if (/^\s*#/.test(raw)) continue
    const indent = raw.match(/^\s*/)[0].length
    const body = raw.slice(indent)

    if (/^\s*-/.test(raw)) {
      flush()
      problems.push({ kind: 'yaml-shape', line, message: '不支持列表（`- `）——条目是扁平键值' })
      continue
    }

    // 块标量（`|` / `>`）的内容行里完全可能出现 `only: no CLI …` 这种一行——
    // 先判断「这是不是上一个块的内容」，再判断它是不是一个键。
    if (target && target.block && indent > target.indent) {
      target.parts.push(body)
      continue
    }
    // 跨行的引号标量：`en: 'Provides …` 换行再闭引号是合法 YAML。
    if (target && target.quoted && indent > target.indent) {
      target.parts.push(body)
      const joined = target.parts.join(' ')
      if (/(?:'|")\s*$/.test(joined) && (joined.match(/'/g) ?? []).length % 2 === 0) flush()
      continue
    }

    const match = body.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!match) {
      // 不是 `键: 值` 的一行，只可能是上一个值的续行（描述换行是最常见的写法）。
      if (target && indent > target.indent) {
        target.parts.push(body)
        continue
      }
      problems.push({ kind: 'yaml-shape', line, message: `这一行不是「键: 值」，也不是上一行的续行：${body.slice(0, 40)}` })
      continue
    }

    flush()
    const [, key, restRaw] = match
    const rest = restRaw.trim()
    if (indent === 0) {
      inDescription = key === 'description' && rest === ''
      if (rest === '') {
        if (key !== 'description') problems.push({ kind: 'yaml-shape', line, message: `${key} 没有值` })
        else fields.set(key, '')
        continue
      }
      if (/^[|>][-+]?$/.test(rest)) {
        target = { map: fields, key, indent, block: rest[0], parts: [], line }
        continue
      }
      if (openQuote(rest)) {
        target = { map: fields, key, indent, block: null, quoted: true, parts: [rest], line }
        continue
      }
      setValue(fields, key, unquote(rest), line)
      continue
    }
    if (!inDescription || indent !== 2) {
      problems.push({ kind: 'yaml-shape', line, message: '只支持 description: 下面一层缩进；其它嵌套请摊平' })
      continue
    }
    if (rest === '') {
      problems.push({ kind: 'yaml-shape', line, message: `description.${key} 没有值` })
      continue
    }
    if (/^[|>][-+]?$/.test(rest)) {
      target = { map: description, key, indent, block: rest[0], parts: [], line }
      continue
    }
    if (openQuote(rest)) {
      target = { map: description, key, indent, block: null, quoted: true, parts: [rest], line }
      continue
    }
    target = { map: description, key, indent, block: null, parts: [unquote(rest)], line }
    // 单行值立即落盘；等下一行看是不是续行，续行会往 parts 里追加后重新 flush。
    flush()
  }
  flush()
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
  // 上游实际合并过 `name: dsh-myrules` 这种只写包名的条目，所以这一条只提示：
  // 文档写的是 owner/repo，真实执行没那么严。判 error 会把人推去改一个不会被拦的东西。
  if (name && !nameMatch) add('warn', 'name-shape', 0, 'name 通常写 owner/repo 或 owner/repo#sub——只写包名与文档不一致（上游偶尔也收）')
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
    // 上游实际合并过 `#packages/browser/bridge-browser` 这种整条路径的写法，所以
    // 不一致只提示。判 error 会让一份已经能被收录的条目被打回。
    if (sub && lastSegment && sub !== lastSegment && !sub.endsWith(`/${lastSegment}`) && !sub.endsWith(lastSegment)) {
      add('warn', 'sub-path', 0, `name 里的 #${sub} 与 url 最后一段子目录 ${lastSegment} 不一致——上游通常写最后一段`)
    }
    if (sub && !urlPath) add('error', 'sub-path', 0, 'name 里有 #子包，url 却没有 /tree/<ref>/<path>——评审点不进那个目录')
  }

  const category = fields.get('category')
  if (category && !CATEGORIES.includes(category)) {
    add('error', 'category', 0, `category「${category}」不在上游的 ${CATEGORIES.length} 个取值里：${CATEGORIES.join(' ')}`)
  }

  // 上游原文：「只有 description.en 是必填的。写不了中文就不写 zh，维护者会补上。」
  // 第一版把 zh 也判成 error——那是拿自己的偏好当上游规则，会把一份合法投稿打回。
  if (!description.has('en') || description.get('en').trim() === '') {
    add('error', 'description-keys', 0, '缺少 description.en——这是唯一必填的语言')
  }
  if (!description.has('zh') || description.get('zh').trim() === '') {
    add('warn', 'description-keys', 0, '没有 description.zh——上游会补，但补出来的措辞你自己没看过')
  }
  for (const [lang, value] of description) {
    if (PLACEHOLDER.test(value)) add('error', 'description-placeholder', 0, `description.${lang} 里有占位符（TODO / <…> / lorem）`)
  }
  const en = description.get('en') ?? ''
  const zh = description.get('zh') ?? ''
  // 阈值来自观测：160 份已合并条目里，en 的中位长度约 180 字符，最短的一批是 40–60 字符
  // 而照样被收录。原来的 120/40 会把三分之一合法条目判成「太薄」——那是我编的数字。
  if (en && en.length < 50) add('warn', 'description-thin', 0, `description.en 只有 ${en.length} 字符——短到读不出它做什么`)
  if (zh && cjk(zh) < 12) add('warn', 'description-thin', 0, `description.zh 只有 ${cjk(zh)} 个汉字——短到读不出它做什么`)
  // 拿汉字数比英文字符数是不成立的：一个汉字承载的信息约等于一个英文词。真实条目
  // 78 个汉字对 264 个字符被判成「中文像占位」，而那是一条已合并的完整译文。
  const enWords = en.split(/\s+/).filter(Boolean).length
  if (enWords >= 20 && cjk(zh) < enWords * 0.6) add('warn', 'description-parity', 0, `description.zh 只有 ${cjk(zh)} 个汉字，en 有 ${enWords} 个词——中文那半像是占位`)

  // 上游明写「One-line description ending with a period.」——160 份已合并条目里 3 份没做到，
  // 所以是 warn 而不是 error：规则存在，执行的严格程度是真的。
  if (en && !/[.。!！?？]\s*$/.test(en.trim())) {
    add('warn', 'description-period', 0, 'description.en 没有以句号结尾——上游的写法要求是一句完整的话')
  }

  // tarball 是 documented 的可选字段：不发 npm 时指向 GitHub Release 的预构建包。
  const tarball = fields.get('tarball')
  if (tarball !== undefined) {
    if (!/^https:\/\//.test(tarball)) add('warn', 'tarball-shape', 0, 'tarball 要用绝对 https 地址（GitHub Release 附件）')
    else if (!/\.(tgz|tar\.gz)$/i.test(tarball)) add('warn', 'tarball-shape', 0, 'tarball 的扩展名不像打包文件（.tgz / .tar.gz）')
  }

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

// 条目说的那件事，仓库里有没有：上游第一号打回理由是「只声明了 dsh.client」，
// 那件事在 yaml 里看不出来——必须去看仓库（或 monorepo 子包）的 package.json。
// 这是本地能替投稿者挡掉的最后一公里，所以放在同一个检查里，一条命令跑完。
export function checkEntryAgainstRepo(text, repoDir, options = {}) {
  const base = lintPluginEntry(text, options)
  const findings = [...base.findings]
  const add = (level, rule, message) => findings.push({ level, rule, line: 0, message })
  const { fields } = parseEntry(text)
  const url = fields.get('url') ?? ''
  const urlMatch = url.match(URL_SHAPE)
  const subPath = urlMatch?.[4] ?? null

  const packageDir = subPath ? join(repoDir, subPath) : repoDir
  if (!existsSync(packageDir)) {
    add('error', 'repo-package-missing', `${subPath ? `子包目录 ${subPath}` : '仓库目录'}不存在：${packageDir}`)
  } else {
    const manifestPath = join(packageDir, 'package.json')
    if (!existsSync(manifestPath)) {
      add('error', 'repo-package-missing', `${packageDir} 里没有 package.json——上游要能 install 的包`)
    } else {
      let manifest = null
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      } catch (error) {
        add('error', 'repo-manifest-unparsable', `package.json 不是合法 JSON：${String(error.message).slice(0, 60)}`)
      }
      if (manifest) {
        const patch = manifest.dsh?.bundle?.patch
        if (!patch) {
          add('error', 'repo-bundle-missing', 'package.json 没有 dsh.bundle.patch——上游最常见的打回原因（只有 dsh.client 装不上）')
        } else if (!existsSync(join(packageDir, patch))) {
          add('error', 'repo-patch-missing', `dsh.bundle.patch 指向 ${patch}，但包里没有这个文件`)
        }
        const nameMatch = String(fields.get('name') ?? '').match(NAME_SHAPE)
        const sub = nameMatch?.[3]
        if (sub && manifest.name && sub !== manifest.name) {
          add('warn', 'repo-name-mismatch', `条目 name 里的 #${sub} 与这个包的 name（${manifest.name}）不一致`)
        }
      }
    }
  }

  const errors = findings.filter(finding => finding.level === 'error').length
  const warnings = findings.filter(finding => finding.level === 'warn').length
  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  return {
    ok: errors === 0,
    errors,
    warnings,
    findings,
    checked: { ...base.checked, repoChecked: (typeof repoDir === 'string' ? packageDir.replace(repoDir, '.') : packageDir).slice(0, 80) },
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
      const options = { filename: typeof body.filename === 'string' ? body.filename : undefined }
      // `repo` 给了就一并核对仓库：一条条目对不对，一半在 yaml，一半在那个包里。
      return reply(200, typeof body.repo === 'string' && body.repo ? checkEntryAgainstRepo(text, body.repo, options) : lintPluginEntry(text, options))
    } catch (error) {
      return reply(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
  return send
}