// A LICENSE file is decidable in three ways that cost real money when wrong:
// whether the body is a recognized license at all, whether the copyright line
// names someone and a plausible year, and whether the template placeholders
// were left in. This verifies exactly those.

export const name = 'license-check'
export const inject = ['webServer']

// A fingerprint of each license body: two or three phrases that only appear in
// that license. Matching on the phrase rather than on the title is deliberate —
// a file titled "MIT License" whose body is the GPL is a trap for the reader.
const SIGNATURES = [
  {
    id: 'MIT',
    spdx: 'MIT',
    phrases: ['Permission is hereby granted, free of charge', 'THE SOFTWARE IS PROVIDED "AS IS"'],
  },
  {
    id: 'Apache-2.0',
    spdx: 'Apache-2.0',
    phrases: ['Apache License', 'Version 2.0, January 2004', 'http://www.apache.org/licenses/'],
  },
  {
    id: 'BSD-3-Clause',
    spdx: 'BSD-3-Clause',
    phrases: ['Redistribution and use in source and binary forms', 'Neither the name of'],
  },
  {
    id: 'BSD-2-Clause',
    spdx: 'BSD-2-Clause',
    phrases: ['Redistribution and use in source and binary forms'],
  },
  {
    id: 'ISC',
    spdx: 'ISC',
    phrases: ['Permission to use, copy, modify, and/or distribute this software'],
  },
  {
    id: 'GPL-3.0',
    spdx: 'GPL-3.0',
    phrases: ['GNU GENERAL PUBLIC LICENSE', 'Version 3, 29 June 2007'],
  },
  {
    id: 'GPL-2.0',
    spdx: 'GPL-2.0',
    phrases: ['GNU GENERAL PUBLIC LICENSE', 'Version 2, June 1991'],
  },
  {
    id: 'LGPL-3.0',
    spdx: 'LGPL-3.0',
    phrases: ['GNU LESSER GENERAL PUBLIC LICENSE', 'Version 3, 29 June 2007'],
  },
  {
    id: 'AGPL-3.0',
    spdx: 'AGPL-3.0',
    phrases: ['GNU AFFERO GENERAL PUBLIC LICENSE', 'Version 3, 19 November 2007'],
  },
  {
    id: 'MPL-2.0',
    spdx: 'MPL-2.0',
    phrases: ['Mozilla Public License Version 2.0'],
  },
  {
    id: 'Unlicense',
    spdx: 'Unlicense',
    phrases: ['This is free and unencumbered software released into the public domain'],
  },
  {
    id: 'CC0-1.0',
    spdx: 'CC0-1.0',
    phrases: ['CC0 1.0 Universal', 'Statement of Purpose'],
  },
]

// Placeholders that mean the template was never filled in.
const PLACEHOLDERS = [
  /<year>/i,
  /<copyright holders?>/i,
  /\[yyyy\]/i,
  /\[fullname\]/i,
  /\[name of copyright owner\]/i,
  /<name of author>/i,
  /<owner>/i,
  /\{\{.*?\}\}/,
]

export function detectLicense(text) {
  const haystack = String(text)
  let best = null
  for (const signature of SIGNATURES) {
    const hits = signature.phrases.filter(phrase => haystack.includes(phrase)).length
    if (hits === signature.phrases.length) {
      // A longer, more specific signature wins over BSD-2's single phrase.
      if (!best || signature.phrases.length > best.signature.phrases.length) {
        best = { signature, hits }
      }
    }
  }
  return best ? { spdx: best.signature.spdx, id: best.signature.id, matched: best.hits } : null
}

export function lintLicense(text, rules = {}) {
  const expected = rules.expected ?? null
  const findings = []
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message })
  const lines = String(text).split('\n')

  if (String(text).trim() === '') {
    return { ok: false, checked: { detected: null }, errors: 1, warnings: 0, findings: [{ level: 'error', rule: 'empty', line: 0, message: 'LICENSE 文件是空的' }] }
  }

  const detected = detectLicense(text)
  if (!detected) {
    add('error', 'unrecognized', 0, '正文不是任何可识别许可证的条文（认得 MIT / Apache-2.0 / BSD-2 / BSD-3 / ISC / GPL-2.0 / GPL-3.0 / LGPL-3.0 / AGPL-3.0 / MPL-2.0 / Unlicense / CC0-1.0）——自拟条款不是不行，但要确认是有意的')
  }

  // A file whose title says one license and whose body is another is the
  // worst failure here: the reader trusts the title.
  const titleLine = lines.slice(0, 5).join(' ')
  const titleHit = SIGNATURES.find(signature => new RegExp(signature.id.replace(/[.-]/g, '[-. ]?'), 'i').test(titleLine))
  if (detected && titleHit && titleHit.spdx !== detected.spdx) {
    add('error', 'title-body-mismatch', 1, `标题写的是 ${titleHit.spdx}，正文却是 ${detected.spdx} 的条文——读者信的是标题`)
  }

  // Expected declaration (package.json's license field, say) must match the body.
  if (expected && detected && expected !== detected.spdx) {
    add('error', 'declared-mismatch', 0, `声明的是 ${expected}，正文却是 ${detected.spdx}——发布元数据与 LICENSE 不一致`)
  }

  // Copyright line: who holds it and when.
  const copyright = lines.find(line => /copyright/i.test(line))
  if (!copyright) {
    add('error', 'copyright-missing', 0, '没有 Copyright 行——没有版权人，许可授予的对象就不明确')
  } else {
    const year = copyright.match(/\b(\d{4})\b/)
    if (!year) {
      add('error', 'copyright-year-missing', lines.indexOf(copyright) + 1, `第 ${lines.indexOf(copyright) + 1} 行 Copyright 没有年份：「${copyright.trim().slice(0, 40)}」`)
    } else {
      const value = Number(year[1])
      const now = new Date().getFullYear()
      if (value > now) {
        add('error', 'copyright-year-future', lines.indexOf(copyright) + 1, `第 ${lines.indexOf(copyright) + 1} 行版权年份 ${value} 在未来（现在是 ${now}）`)
      } else if (now - value > 1) {
        // Not an error: a static year is normal for a one-shot release, and
        // only the author knows whether the work is still maintained.
        add('warn', 'copyright-year-stale', lines.indexOf(copyright) + 1, `第 ${lines.indexOf(copyright) + 1} 行版权年份是 ${value}（今年 ${now}）——持续维护的项目通常写年份区间`)
      }
    }
    const holder = copyright.replace(/.*copyright[^0-9]*(\d{4}(?:\s*[-–]\s*\d{4})?)?/i, '').trim()
    if (holder === '' || /^(?:\(c\)|©|all rights reserved)[\s.,]*$/i.test(holder)) {
      add('error', 'copyright-holder-missing', lines.indexOf(copyright) + 1, `第 ${lines.indexOf(copyright) + 1} 行 Copyright 没有版权人名称`)
    }
  }

  // Leftover template placeholders.
  for (const [index, line] of lines.entries()) {
    for (const pattern of PLACEHOLDERS) {
      if (pattern.test(line)) {
        add('error', 'placeholder-left', index + 1, `第 ${index + 1} 行模板占位符没填：「${line.trim().slice(0, 40)}」`)
        break
      }
    }
  }

  const order = { error: 0, warn: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  const errors = findings.filter(finding => finding.level === 'error').length
  return {
    ok: errors === 0,
    checked: { detected: detected ? detected.spdx : null, lines: lines.length },
    errors,
    warnings: findings.length - errors,
    findings,
  }
}

export function apply(ctx, config = {}) {
  const prefix = config.path || '/license-check/api'
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
      return send(200, lintLicense(text, body.rules))
    } catch (error) {
      return send(400, { error: error.message || 'request failed' })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }))
}
