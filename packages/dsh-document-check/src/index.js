// 一条给 agent 用的工具：把 31 个文档检查交给模型自己调用。
//
// 为什么做成工具而不是再加一条路由：这 31 个包的检查逻辑早就有了，但只有 HTTP 端点——
// 人得记得去 POST，agent 在交付前根本不会想到它。工具是模型能自己看见、自己决定调用的
// 那一层，所以在「agent 写完文档、还没交给人」这个位置，它是唯一可能被真的用上的形状。
//
// 一个工具而不是 31 个：27 条工具定义会挤占上下文，而 agent 在前 10 分钟里分不清
// dsh_adr_check 与 dsh_spec_doc_check 哪个该用。这里用 `check` 参数选类型，
// 工具描述只说一件事——「交付之前，按文体检查一遍」。

import { defineTool } from '@deepseek-ai/dsh-tools'
import { CHECKS, SLUGS, BY_SLUG } from './checks.generated.js'

export const name = 'document-check'
export const inject = ['tools']

/** 一条输出里最多回几条 findings。超出就截断并明说——不截断会把整份报告灌进上下文。 */
export const MAX_FINDINGS = 25

/**
 * 把用户/模型写的检查名归一到一个 slug。
 * 接受 `adr`、`adr-check`、`ADR-check`、`dsh-adr-check`——模型不会记得我们爱用哪种拼法，
 * 而「不认识这个检查」这种错误对调用方没有任何信息量。
 */
export function resolveSlug(input) {
  const raw = String(input ?? '').trim().toLowerCase()
  if (!raw) return null
  const candidates = [raw, `${raw}-check`, raw.replace(/-check$/, ''), raw.replace(/^dsh-/, ''), raw.replace(/^dsh-/, '').replace(/-check$/, '')]
  for (const candidate of candidates) if (BY_SLUG.has(candidate)) return candidate
  return null
}

let cache = new Map()

async function linterOf(entry) {
  const key = entry.pkg
  if (!cache.has(key)) {
    const mod = await import(entry.pkg)
    cache.set(key, mod[entry.exportName])
  }
  return cache.get(key)
}

/**
 * 跑一个检查。返回的形状是给模型看的最小事实集：结论、两个计数、以及带行号的 findings。
 * 不返回各包自己的 `checked` 明细——那是给人看面板用的，对模型是噪音。
 */
export async function lintDocument(check, text, rules = {}) {
  const slug = resolveSlug(check)
  if (!slug) {
    const error = new Error(`unknown check "${check}"; known checks: ${SLUGS.join(', ')}`)
    error.code = 'UNKNOWN_CHECK'
    throw error
  }
  if (typeof text !== 'string' || text.trim() === '') {
    const error = new Error('text is required: pass the document content')
    error.code = 'EMPTY_TEXT'
    throw error
  }
  const entry = BY_SLUG.get(slug)
  const lint = await linterOf(entry)
  const result = await lint(text, rules)
  const findings = (result.findings ?? []).map(finding => ({
    level: finding.level,
    rule: finding.rule,
    line: finding.line ?? 0,
    message: finding.message,
  }))
  return {
    check: slug,
    ok: Boolean(result.ok),
    errors: result.errors ?? findings.filter(finding => finding.level === 'error').length,
    warnings: result.warnings ?? findings.filter(finding => finding.level === 'warn').length,
    findings: findings.slice(0, MAX_FINDINGS),
    truncated: findings.length > MAX_FINDINGS,
  }
}

function renderResult(args, value) {
  const lines = [`${value.ok ? 'ok' : 'fail'}: ${value.check} — ${value.errors} error(s), ${value.warnings} warning(s)`]
  for (const finding of value.findings) {
    lines.push(`${finding.level === 'error' ? 'error' : 'warn'} ${finding.rule} line ${finding.line}: ${finding.message}`)
  }
  if (value.truncated) lines.push(`(only the first ${MAX_FINDINGS} findings are shown; fix these and call again)`)
  if (value.ok && value.warnings === 0) lines.push('no findings — the document passes this genre\'s structural rules')
  return [{ type: 'text', text: lines.join('\n') }]
}

export function defineDocumentCheckTool() {
  return defineTool({
    name: 'document_check',
    description:
      'Check a document you produced against one genre\'s structural rules before delivering it (ADR, runbook, release notes, incident report, invoice, resume, security advisory, test report, and 23 more). Returns findings with rule ids and line numbers: errors are specific defects to fix, warnings are judgement calls. Runs locally with no network and no model calls, so it is cheap enough to run before every delivery.',
    parameters: {
      check: {
        type: 'string',
        required: true,
        enum: SLUGS,
        description: `Which genre to check against. One of: ${SLUGS.join(', ')}.`,
      },
      text: {
        type: 'string',
        required: true,
        description: 'The document content to check, in full.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          check: { type: 'string', required: true },
          ok: { type: 'boolean', required: true },
          errors: { type: 'number', required: true },
          warnings: { type: 'number', required: true },
          findings: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                level: { type: 'string', required: true },
                rule: { type: 'string', required: true },
                line: { type: 'number', required: true },
                message: { type: 'string', required: true },
              },
            },
          },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: renderResult,
    },
    timeoutMs: 15_000,
    isConcurrencySafe: () => true,
    async execute(args) {
      return lintDocument(args.check, args.text, args.rules)
    },
  })
}

export function apply(ctx) {
  ctx.tools.register(defineDocumentCheckTool())
}

export { CHECKS, SLUGS }