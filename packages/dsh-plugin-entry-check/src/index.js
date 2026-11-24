// 提交前的入口检查：一份 awesome-dsh-plugin 目录条目 yaml 会不会被 CI 打回。
//
// 为什么值得单独一个检查：目录的 CI 只会说「形状不对」，而形状有十几条硬要求——文件名的
// 双下划线与短横、name 与 url 必须指同一个仓库、monorepo 子包要在 url 里写 /tree/<ref>/<path>
// 且 name 里写 #sub 且两者一致、category 必须是那 24 个之一、description 必须 en/zh 都有。
// 每一条都能在本地一秒判掉，而每一条都要在 PR 里来回一轮才能发现。
//
// 判据全部来自上游 contributing.md 的正文，不来自印象。上游改规则时这里要跟着改——所以
// CATEGORIES 与文件名规则在测试里各有两条断言（该收的收、该拒的拒）。

import { load } from 'js-yaml'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
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
// `TODO` 只在**全大写**时才算占位符：`Todo plugin that records…` 是插件主题词，
// 大小写不敏感的匹配把三份正常条目判成了「描述还是 TODO」。`lorem ipsum` 与中文
// 那几种写法继续不区分大小写。
// `TODO` 只在全大写时是占位符：`Todo plugin …` 是主题词（三份真实条目被这条误伤）。
const PLACEHOLDER = /^\s*(?:TODO|TBD|FIXME)\b|lorem ipsum|^\s*(?:待填|占位|待补充|待完善)/
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
  const source = String(text ?? '')
  if (source.trim() === '') return { fields, description, problems }

  // 用 js-yaml 而不是手写子集解析：上游自己也是 js-yaml，两边的解析结果必须一致，
  // 否则「我判他错」其实是「我的解析器不认」。手写那版已经被真实条目打回来四次——
  // 块标量、跨行引号标量、行内注释、整份 2 空格缩进的文档、JSON 写成 .yml——
  // 每一次都是我把实现限制说成了投稿者的错误。
  let document
  try {
    document = load(source)
  } catch (error) {
    const line = Number(error.mark?.line ?? 0) + 1
    const reason = String(error.reason ?? error.message).split('\n')[0].slice(0, 100)
    // 重复键是它自己的一类：YAML 不报错、静默取后一个，只有开了 strict 才抛——
    // js-yaml 抛的是 duplicated mapping key，规则名保持 duplicate-key。
    const kind = /duplicated mapping key/i.test(reason) ? 'duplicate-key' : 'yaml-shape'
    problems.push({ kind, line, message: kind === 'duplicate-key' ? `${reason}——YAML 会静默取后一个` : `YAML 解析失败：${reason}` })
    return { fields, description, problems }
  }

  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    problems.push({ kind: 'yaml-shape', line: 1, message: '顶层的 YAML 不是映射（键: 值）——条目就是一组标量' })
    return { fields, description, problems }
  }

  for (const [key, value] of Object.entries(document)) {
    if (key === 'description') {
      if (value === null || value === undefined) {
        fields.set(key, '')
        continue
      }
      if (typeof value !== 'object' || Array.isArray(value)) {
        problems.push({ kind: 'yaml-shape', line: 0, message: 'description 必须是 en/zh 这样的一层映射' })
        continue
      }
      for (const [lang, langValue] of Object.entries(value)) {
        if (langValue !== null && typeof langValue === 'object') {
          problems.push({ kind: 'yaml-shape', line: 0, message: `description.${lang} 还是嵌套结构——这一层只有字符串` })
          continue
        }
        description.set(lang, langValue === null || langValue === undefined ? '' : String(langValue))
      }
      continue
    }
    // 列表、嵌套映射这些形状不是条目：明确报出来，而不是把一个对象 String 成 [object Object]。
    if (value !== null && typeof value === 'object') {
      problems.push({ kind: 'yaml-shape', line: 0, message: `${key} 的值是${Array.isArray(value) ? '列表' : '嵌套映射'}——条目这一层只有标量` })
      continue
    }
    fields.set(key, value === null || value === undefined ? '' : String(value))
  }
  return { fields, description, problems }
}

/** 与上游同义的 slug：`o/r` → `o__r`；`o/r/tree/main/packages/x` → `o__r--packages-x`。
 *
 * 文件名必须从 **url** 推，不能从文件名反推：仓库名自己可能含 `--`
 * （`TryDing-T/dsh-Plugin--ChineseChess`），反推会把仓库名从中间锯开，
 * 于是「文件名应为 X（当前 X）」这种自相矛盾的错误就出现了——真实条目里有 2 份。
 */
export function slugFor(url) {
  const match = String(url ?? '').match(/^https:\/\/github\.com\/([^/\s#]+)\/([^/\s#]+?)(?:\/tree\/[^/\s]+\/(.+?))?\/?$/)
  if (!match) return null
  const [, owner, repo, subPath] = match
  return subPath ? `${owner}__${repo}--${subPath.replace(/\//g, '-')}` : `${owner}__${repo}`
}

/** 从文件名推出应有的 owner / repo / 子路径。`owner__repo--path-with-dashes.yml`。 */
export function expectedName(filename) {
  const base = String(filename).split('/').pop().replace(/\.ya?ml$/i, '')
  const [left, ...rest] = base.split('--')
  const [owner, repo] = left.split('__')
  if (!owner || !repo) return null
  return { owner, repo, path: rest.length > 0 ? rest.join('--') : null }
}

// --- 与上游 scripts/lib/entries.mjs 同义的判据 ---------------------------------
// 这些是「本地说 OK、CI 拒掉」最容易出问题的地方，所以逐字对齐它们的边界：
// tarball 必须在 GitHub 的 release 主机上、后缀 .tgz/.tar.gz；icon 必须在 GitHub
// 图床上、后缀是位图（png/jpg/jpeg/webp）。svg 不行——上游不收矢量图。
export const TARBALL_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'])
export const ICON_HOSTS = new Set(['raw.githubusercontent.com', 'user-images.githubusercontent.com', 'camo.githubusercontent.com', 'github.com'])
export const ICON_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']

export function tarballProblem(value) {
  if (typeof value !== 'string' || !value.trim()) return '必须是一个 URL 字符串'
  let url
  try {
    url = new URL(value)
  } catch {
    return `不是合法 URL：${value}`
  }
  if (url.protocol !== 'https:') return '必须是 https'
  if (!TARBALL_HOSTS.has(url.hostname)) return `必须托管在 GitHub releases（当前 ${url.hostname}）`
  if (url.hostname === 'github.com' && !url.pathname.includes('/releases/')) return '必须指向 GitHub release 附件'
  if (!url.pathname.endsWith('.tgz') && !url.pathname.endsWith('.tar.gz')) return '必须以 .tgz / .tar.gz 结尾'
  return null
}

export function iconProblem(value) {
  if (typeof value !== 'string' || !value.trim()) return '必须是一个 URL 字符串'
  let url
  try {
    url = new URL(value)
  } catch {
    return `不是合法 URL：${value}`
  }
  if (url.protocol !== 'https:') return '必须是 https'
  if (!ICON_HOSTS.has(url.hostname)) return `必须托管在 GitHub（当前 ${url.hostname}）`
  if (!ICON_EXTENSIONS.some(extension => url.pathname.toLowerCase().endsWith(extension))) {
    return `必须指向位图（${ICON_EXTENSIONS.join(' / ')}）`
  }
  return null
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
      // GitHub 的 owner/repo 不区分大小写：12960 份真实条目里有 2 份 name 写小写、
      // url 写原名，照样被合并。只有真正不同的仓库才是 error。
      const sameRepo = owner.toLowerCase() === urlOwner.toLowerCase() && repo.toLowerCase() === urlRepo.toLowerCase()
      if (sameRepo) {
        add('warn', 'name-shape', 0, `name 与 url 的大小写不一致（${owner}/${repo} vs ${urlOwner}/${urlRepo}）——GitHub 不区分，但列表里显示的链接文字会跟仓库页不一样`)
      } else {
        add('error', 'name-shape', 0, `name 指向 ${owner}/${repo}，url 指向 ${urlOwner}/${urlRepo}——评审会看这两个是不是同一个仓库`)
      }
    }
    // 上游实际合并过 8 份「url 指到 /tree/main/packages/bundle、name 不带 #sub」的条目，
    // 所以文档这么写、执行没那么严：提示，不判错。
    if (urlPath && !sub) add('warn', 'sub-path', 0, 'url 指到子目录，name 却没有 #子包名（文档要求写，上游偶尔也收）')
    // #sub 写的是包目录名，不是整条路径：真实条目是
    //   url: …/tree/main/packages/dsh-adr-check + name: …#dsh-adr-check
    // 第一版拿整条 packages/dsh-adr-check 去比，把四份已合并的条目全判成不一致。
    const lastSegment = urlPath ? urlPath.split('/').filter(Boolean).pop() : null
    // 上游实际合并过 `#packages/browser/bridge-browser` 这种整条路径的写法，所以
    // 不一致只提示。判 error 会让一份已经能被收录的条目被打回。
    if (sub && lastSegment && sub !== lastSegment && !sub.endsWith(`/${lastSegment}`) && !sub.endsWith(lastSegment)) {
      add('warn', 'sub-path', 0, `name 里的 #${sub} 与 url 最后一段子目录 ${lastSegment} 不一致——上游通常写最后一段`)
    }
    // 上游合并过 2 份「name 带 #子包、url 只指到仓库根」的条目，所以是提示不是错。
    if (sub && !urlPath) add('warn', 'sub-path', 0, 'name 里有 #子包，url 却没有 /tree/<ref>/<path>——读者点进去落在仓库根，找不到那个子包')
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
    // 上游 validateEntries：`must be a single line` —— 块标量写出来的多行描述在本地
    // 看起来没问题，交上去会被 CI 打回。这条是我和上游最大的分歧：判据必须一致。
    if (value.includes('\n')) {
      add('error', 'description-multiline', 0, `description.${lang} 是多行——上游只收单行（写成一行，用空格连接）`)
    }
  }
  // 站点只渲染 en / zh：`ja` 这种键写进去没人读得到，上游明确要求删。
  for (const lang of description.keys()) {
    if (!['en', 'zh'].includes(lang)) add('error', 'description-locale', 0, `description.${lang} 这个语言键站点不渲染（只认 en / zh）——删掉它`)
  }
  if (description.has('zh') && String(description.get('zh')).trim() === '') {
    add('error', 'description-keys', 0, 'description.zh 存在但是空的——不翻译就把这个键整个删掉')
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

  // tarball 与 icon 的判据照抄上游 validateEntries：主机白名单 + 后缀。本地说「没问题」
  // 而 CI 拒掉，是最坏的一种不一致。
  const tarball = fields.get('tarball')
  if (tarball !== undefined) {
    const problem = tarballProblem(tarball)
    if (problem) add('error', 'tarball-shape', 0, `tarball ${problem}`)
  }

  const icon = fields.get('icon')
  if (icon !== undefined) {
    const problem = iconProblem(icon)
    if (problem) add('error', 'icon-shape', 0, `icon ${problem}`)
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
    const base = String(filename).split('/').pop()
    const want = urlMatch ? slugFor(url) : null
    if (want) {
      // 上游 validateEntries：`filename must match the url — expected <slug>.yml`，error。
      if (base !== `${want}.yml`) {
        add('error', 'filename', 0, `文件名应为 ${want}.yml（当前 ${base}）——上游 CI 会拒`)
      }
    } else if (!expectedName(filename)) {
      add('error', 'filename', 0, `文件名 ${base} 不符合 owner__repo.yml 或 owner__repo--path.yml`)
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


// --- 整目录模式 ---------------------------------------------------------------
// 单文件检查回答「我这条会不会被打回」；整目录检查回答维护者的问题：
// 「这批条目里有没有互相冲突的（同一个 url 两份）、哪些规则在整批上高频触发」。
// 12960 份条目的目录里，跨条目的错只有单文件看不见的那种，所以这一层必须单独有。
export function checkEntryDirectory(dir, options = {}) {
  if (!existsSync(dir)) throw new Error(`目录不存在：${dir}`)
  const files = readdirSync(dir).filter(name => /\.ya?ml$/i.test(name)).sort()
  const entries = []
  const byRule = new Map()
  const byUrl = new Map()  // url → [files]
  const perFile = []
  let errors = 0
  let warnings = 0
  // 第一遍只收 url：重复 url 要在**每一份**涉及的条目上都报出来。只报「后一份」会让
  // 作者以为自己是先来的那个，而去改别人的文件。
  const urlOwners = new Map()
  for (const file of files) {
    try {
      const { fields } = parseEntry(readFileSync(join(dir, file), 'utf8'))
      const url = String(fields.get('url') ?? '').trim()
      if (url) urlOwners.set(url, [...(urlOwners.get(url) ?? []), file])
    } catch {
      // 读不出来或解析不了的，留给第二遍按正常规则报。
    }
  }

  for (const file of files) {
    // 读不出来是环境问题，不是条目问题：直接抛，让 CLI 以 exit 2 说清楚，
    // 而不是把它混成一条「规则」——那会让规则表里多一条永远只在磁盘坏掉时才出现的规则。
    const text = readFileSync(join(dir, file), 'utf8')
    const result = lintPluginEntry(text, { filename: file })
    const findings = [...result.findings]
    const { fields } = parseEntry(text)
    const url = String(fields.get('url') ?? '').trim()
    if (url) {
      const owners = urlOwners.get(url) ?? []
      if (owners.length > 1) {
        const others = owners.filter(other => other !== file).join(', ')
        findings.push({ level: 'error', rule: 'duplicate-url', line: 0, message: `url 同时出现在 ${others}——同一份工作在一页里会重复计数` })
      }
    }
    for (const finding of findings) byRule.set(finding.rule, (byRule.get(finding.rule) ?? 0) + 1)
    const fileErrors = findings.filter(finding => finding.level === 'error').length
    errors += fileErrors
    warnings += findings.length - fileErrors
    perFile.push({ file, findings })
    entries.push({ file, url })
  }
  const ruleRows = [...byRule].sort((a, b) => b[1] - a[1]).map(([rule, count]) => ({ rule, count }))
  return {
    ok: errors === 0,
    dir,
    entries: entries.length,
    errors,
    warnings,
    rules: ruleRows,
    // 默认只回有问题的文件：12960 份里绝大多数是干净的，全列出来没人看。
    files: options.all ? perFile : perFile.filter(row => row.findings.length > 0),
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