import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export function validateIndexNowConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('indexnow.json must contain an object')
  const { host, key, keyLocation, urlPrefix, endpoint } = value
  if (typeof host !== 'string' || !/^[a-z0-9.-]+$/i.test(host)) throw new Error('IndexNow host is invalid')
  if (typeof key !== 'string' || !/^[a-z0-9-]{8,128}$/i.test(key)) throw new Error('IndexNow key must contain 8-128 letters, numbers, or dashes')
  const urls = Object.fromEntries(Object.entries({ keyLocation, urlPrefix, endpoint }).map(([name, input]) => {
    if (typeof input !== 'string') throw new Error(`IndexNow ${name} is required`)
    const url = new URL(input)
    if (url.protocol !== 'https:') throw new Error(`IndexNow ${name} must use HTTPS`)
    return [name, url]
  }))
  if (urls.keyLocation.host !== host || urls.urlPrefix.host !== host) throw new Error('IndexNow keyLocation and urlPrefix must use the declared host')
  if (!urls.keyLocation.href.startsWith(urls.urlPrefix.href)) throw new Error('IndexNow keyLocation must stay inside urlPrefix')
  if (!urls.keyLocation.pathname.endsWith(`/${key}.txt`)) throw new Error('IndexNow key filename must be <key>.txt')
  return { host, key, keyLocation: urls.keyLocation.href, urlPrefix: urls.urlPrefix.href, endpoint: urls.endpoint.href }
}

export async function readIndexNowConfig(root, { required = false } = {}) {
  let source
  try {
    source = await readFile(resolve(root, 'indexnow.json'), 'utf8')
  } catch (error) {
    if (!required && error?.code === 'ENOENT') return null
    throw error
  }
  return validateIndexNowConfig(JSON.parse(source))
}
