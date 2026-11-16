// A resume is decidable from the markdown: how to reach the person, when each
// stint started and ended, and whether the timeline overlaps itself. This
// verifies exactly those, with the dates parsed once and reused.

export const name = 'resume-check'
export const inject = ['webServer']

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const CONTACT_LINE = /(?:电话|手机|邮箱|微信|联系方式|email|phone|tel)/i
const EDUCATION_HEADINGS = /(?:^|\n)#{1,6}[^\n]*(?:教育|学历|education)/i
const EDUCATION_LINE = /(?:毕业(?:院校)?|本科|硕士|博士|大专|MBA|university|bachelor|master|ph\.?d)/i

// One date-range matcher for work history: 2020.3-2022.5, 2020年3月-2022年5月,
// 2020/3 ~ 2022/5, 2020-03 to 2022-05, and 至今/现在/present as the open end.
const RANGE = /(\d{4})\s*[年./-]\s*(\d{1,2})?\s*(?:月)?\s*(?:[-–—~至到]\s*(?:\d{4})?\s*[年./-]?\s*(\d{1,2})?\s*(?:月)?)?\s*(至今|现在|present|now|至今)?/i

function toMonths(year, month) {
  return Number(year) * 12 + (month ? Number(month) : 6)
}

// Every date range in the document, in order, with the line it sits on.
export function dateRanges(text) {
  const out = []
  text.split('\n').forEach((line, index) => {
    const matches = [...line.matchAll(/(\d{4})\s*[年./-]\s*(\d{1,2})?\s*月?\s*(?:[-–—~至到]\s*(\d{4})\s*[年./-]\s*(\d{1,2})?\s*月?|\s*[-–—~至到]?\s*(至今|现在|present|now))/gi)]
    for (const match of matches) {
      const start = toMonths(match[1], match[2])
      let end = null
      if (match[5]) end = 'open'
      else if (match[3]) end = toMonths(match[3], match[4])
      out.push({ line: index + 1, start, end, text: match[0].trim() })
    }
  })
  return out
}

export function lintResume(text, rules = {}) {
  const allowGaps = rules.allowGaps ?? true
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = text.split('\n')

  // Contact: the reader must be able to reach the person.
  const contactLines = lines.map((line, index) => ({ line, index: index + 1 })).filter(({ line }) => CONTACT_LINE.test(line))
  if (contactLines.length === 0) {
    add('error', 'contact-missing', 0, '没有任何联系方式（认得：电话/手机/邮箱/微信/Email/Phone）')
  } else {
    // Detection is loose but bounded to the email alphabet (a bare \S+ would
    // swallow the CJK colon in 邮箱：a@b.co); validation is strict — the two
    // must not be the same pattern, or an invalid address is never detected.
    for (const match of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g)) {
      const email = match[0].replace(/[.\-]+$/, '')
      if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(email) || /\.\./.test(email)) {
        const number = lines.findIndex(line => line.includes(email)) + 1
        add('error', 'email-invalid', number, `第 ${number} 行邮箱「${email}」不是合法形态（连续点或域缺尾）`)
      }
    }
    for (const { line, index } of contactLines) {
      const phone = line.match(/(?:电话|手机|phone|tel)\s*[：:]?\s*([+()\d\s-]{3,20})/i)
      if (phone) {
        const digits = phone[1].replace(/\D/g, '')
        if (digits.length > 0 && (digits.length < 7 || digits.length > 15)) {
          add('error', 'phone-invalid', index, `第 ${index} 行电话位数 ${digits.length} 不在 7-15 位之间`)
        }
      }
    }
  }

  // Timeline: stints must not overlap; long gaps are informative, not defects.
  const ranges = dateRanges(text).filter(range => range.end !== null)
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1]
    const current = ranges[index]
    if (previous.end === 'open') continue
    if (current.start < previous.end) {
      add('error', 'dates-overlap', current.line, `第 ${current.line} 段经历（${current.text}）与上一段（${previous.text}）时间重叠`)
    } else if (!allowGaps && previous.end !== null && current.start - previous.end > 12) {
      add('warn', 'date-gap', current.line, `第 ${current.line} 段与上一段之间空窗 ${current.start - previous.end} 个月`)
    }
  }

  // An open-ended range followed by a later-STARTING closed range reads as a
  // typo. Education lines legitimately sit below the current job in the
  // document but start earlier, so the comparison is on months, not on lines.
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1]
    const current = ranges[index]
    if (previous.end === 'open' && current.end !== 'open' && current.start > previous.start) {
      add('error', 'dates-order', current.line, `第 ${current.line} 段（${current.text}）开始于「至今」的经历之后——如果是笔误请改成结束日期，如果确实是新经历请把上一段改为结束日期`)
    }
  }

  // Education: standard on every resume; a miss is worth a warning.
  const hasEducation = lines.some(line => EDUCATION_HEADINGS.test(`\n${line}`)) || lines.some(line => EDUCATION_LINE.test(line))
  if (!hasEducation) add('warn', 'education-missing', 0, '没有教育/学历信息（认得：## 教育背景、本科/硕士/博士、毕业院校）')

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return { ok: errors === 0, checked: { ranges: ranges.length, lines: lines.length }, errors, warnings: findings.length - errors, findings }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/resume-check/api'
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
      const text = typeof body.text === 'string' && body.text ? body.text : body.path ? (await import('node:fs/promises')).readFile(body.path, 'utf8') : ''
      if (!text) return send(400, { error: 'text or path is required' })
      return send(200, lintResume(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
