import test from 'node:test'
import assert from 'node:assert/strict'
import { lintDockerfile, parseDockerfile } from '../src/index.js'

const good = `FROM node:22.19.0-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm ci --omit=dev
COPY . .
USER node
CMD ["node", "index.js"]
`

const bad = `FROM node
ADD . /app
ENV API_KEY=sk-live-1234567890
RUN apt-get install -y curl
CMD ["node", "index.js"]
`

test('a clean Dockerfile passes', () => {
  const result = lintDockerfile(good)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.froms, 1)
})

test('every defect class is reported', () => {
  const result = lintDockerfile(bad)
  assert.equal(result.ok, false)
  const rules = result.findings.map(finding => `${finding.rule}:${finding.line}`)
  assert.ok(rules.includes('base-unpinned:1'))
  assert.ok(rules.includes('user-missing:0'))
  assert.ok(rules.includes('secret-in-layer:3'))
  assert.ok(rules.includes('apt-not-cleaned:4'))
  assert.ok(rules.includes('add-instead-of-copy:2'))
})

test('a digest-pinned base image is accepted', () => {
  const text = 'FROM node@sha256:abcd\nWORKDIR /app\nUSER node\n'
  assert.deepEqual(lintDockerfile(text).findings, [])
})

test('an explicit USER root is its own error', () => {
  const text = 'FROM node:22.19.0\nWORKDIR /app\nUSER root\n'
  const result = lintDockerfile(text)
  assert.ok(result.findings.some(finding => finding.rule === 'user-root'))
})

test('ADD of a tarball or URL is allowed', () => {
  const tar = 'FROM alpine:3.20\nWORKDIR /app\nUSER app\nADD app.tar.gz /app/\n'
  assert.ok(!lintDockerfile(tar).findings.some(finding => finding.rule === 'add-instead-of-copy'))
  const url = 'FROM alpine:3.20\nWORKDIR /app\nUSER app\nADD https://example.com/x.bin /app/x\n'
  assert.ok(!lintDockerfile(url).findings.some(finding => finding.rule === 'add-instead-of-copy'))
})

test('a secret read from a build arg or env reference is not a literal', () => {
  const text = 'FROM node:22.19.0\nWORKDIR /app\nUSER node\nENV API_KEY=${API_KEY}\n'
  assert.ok(!lintDockerfile(text).findings.some(finding => finding.rule === 'secret-in-layer'))
})

test('apk without --no-cache warns', () => {
  const text = 'FROM alpine:3.20\nWORKDIR /app\nUSER app\nRUN apk add curl\n'
  assert.ok(lintDockerfile(text).findings.some(finding => finding.rule === 'apk-not-cleaned'))
})

test('continuation lines are one instruction with the first line number', () => {
  const text = 'FROM node:22.19.0\nWORKDIR /app\nUSER node\nRUN apt-get update \\\n  && apt-get install -y curl\n'
  const ops = parseDockerfile(text)
  const run = ops.find(op => op.instruction === 'RUN')
  assert.equal(run.line, 4)
  assert.match(run.args, /apt-get install/)
})

test('the user requirement is configurable', () => {
  const text = 'FROM node:22.19.0\nWORKDIR /app\n'
  assert.ok(lintDockerfile(text).findings.some(finding => finding.rule === 'user-missing'))
  assert.ok(!lintDockerfile(text, { requireUser: false }).findings.some(finding => finding.rule === 'user-missing'))
})

test('allowLatest disables the pinning rule', () => {
  const text = 'FROM node:latest\nWORKDIR /app\nUSER node\n'
  assert.ok(lintDockerfile(text).findings.some(finding => finding.rule === 'base-unpinned'))
  assert.ok(!lintDockerfile(text, { allowLatest: true }).findings.some(finding => finding.rule === 'base-unpinned'))
})

test('from-missing when there is no FROM', () => {
  const result = lintDockerfile('RUN echo hi\n')
  assert.ok(result.findings.some(finding => finding.rule === 'from-missing'))
})

test('an empty file is one empty error', () => {
  const result = lintDockerfile('\n\n')
  assert.equal(result.ok, false)
  assert.equal(result.findings[0].rule, 'empty')
})
