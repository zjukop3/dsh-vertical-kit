import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { readIndexNowConfig } from './indexnow-config.mjs'

const root = process.cwd()
const config = await readIndexNowConfig(root, { required: true })
const sitemap = await readFile(resolve(root, 'site/sitemap.xml'), 'utf8')
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replace(/&amp;/g, '&'))
if (urlList.length === 0 || urlList.length > 10_000) throw new Error('Sitemap must contain 1-10000 URLs')
for (const value of urlList) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.host !== config.host || !url.href.startsWith(config.urlPrefix)) {
    throw new Error(`Sitemap URL is outside the IndexNow key scope: ${value}`)
  }
}

const evidencePath = resolve(root, process.env.INDEXNOW_EVIDENCE_PATH || 'docs/e2e/indexnow-submission.json')
const evidence = {
  ok: false,
  submittedAt: new Date().toISOString(),
  endpoint: config.endpoint,
  keyLocation: config.keyLocation,
  urlList,
  preflight: null,
  responseStatus: null,
  responseBody: null,
  indexingStatus: 'unknown',
  externalActivationClaim: false,
}

async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(30_000) })
}

try {
  const keyResponse = await request(config.keyLocation, { headers: { 'cache-control': 'no-cache' } })
  const keyBody = await keyResponse.text()
  if (!keyResponse.ok || keyBody.trim() !== config.key) {
    throw new Error(`IndexNow key preflight failed: HTTP ${keyResponse.status}`)
  }
  const urls = []
  for (const url of urlList) {
    const response = await request(url, { method: 'HEAD' })
    urls.push({ url, status: response.status })
    if (!response.ok) throw new Error(`Sitemap URL preflight failed: ${url} returned ${response.status}`)
  }
  evidence.preflight = { keyFileVerified: true, urls }
  const response = await request(config.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: config.host, key: config.key, keyLocation: config.keyLocation, urlList }),
  })
  evidence.responseStatus = response.status
  evidence.responseBody = (await response.text()).slice(0, 1000) || null
  evidence.ok = response.status === 200 || response.status === 202
  if (!evidence.ok) throw new Error(`IndexNow submission returned HTTP ${response.status}: ${evidence.responseBody || ''}`)
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error)
  throw error
} finally {
  await mkdir(dirname(evidencePath), { recursive: true })
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify(evidence, null, 2))
}
