import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { lintLicense, detectLicense } from '../src/index.js'

const MIT_BODY = `MIT License

Copyright (c) 2026 zjukop3

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
`

test('this repository own LICENSE passes', async () => {
  const text = await readFile(resolve(import.meta.dirname, '..', 'LICENSE'), 'utf8')
  const result = lintLicense(text)
  assert.deepEqual(result.findings, [])
  assert.equal(result.checked.detected, 'MIT')
})

test('detectLicense identifies the common bodies', () => {
  assert.equal(detectLicense(MIT_BODY).spdx, 'MIT')
  assert.equal(detectLicense('Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/').spdx, 'Apache-2.0')
  assert.equal(detectLicense('Permission to use, copy, modify, and/or distribute this software for any purpose').spdx, 'ISC')
  assert.equal(detectLicense('This is free and unencumbered software released into the public domain').spdx, 'Unlicense')
  assert.equal(detectLicense('something else entirely'), null)
})

test('BSD-3 wins over BSD-2 when both phrases are present', () => {
  const bsd3 = 'Redistribution and use in source and binary forms\nNeither the name of the copyright holder'
  assert.equal(detectLicense(bsd3).spdx, 'BSD-3-Clause')
})

test('an unrecognized body is an error', () => {
  const result = lintLicense('Copyright (c) 2026 someone\n\nDo whatever you want with this.\n')
  assert.ok(result.findings.some(finding => finding.rule === 'unrecognized'))
})

test('a title that disagrees with the body is an error', () => {
  const text = MIT_BODY.replace('MIT License', 'Apache-2.0')
  const result = lintLicense(text)
  assert.ok(result.findings.some(finding => finding.rule === 'title-body-mismatch'))
})

test('a declared license that disagrees with the body is an error', () => {
  const result = lintLicense(MIT_BODY, { expected: 'Apache-2.0' })
  const mismatch = result.findings.find(finding => finding.rule === 'declared-mismatch')
  assert.ok(mismatch)
  assert.match(mismatch.message, /Apache-2\.0/)
  assert.match(mismatch.message, /MIT/)
})

test('a missing copyright line is an error', () => {
  const text = MIT_BODY.replace(/Copyright.*\n/, '')
  assert.ok(lintLicense(text).findings.some(finding => finding.rule === 'copyright-missing'))
})

test('a copyright line without a year or holder names both problems', () => {
  const noYear = MIT_BODY.replace('Copyright (c) 2026 zjukop3', 'Copyright (c) zjukop3')
  assert.ok(lintLicense(noYear).findings.some(finding => finding.rule === 'copyright-year-missing'))
  const noHolder = MIT_BODY.replace('Copyright (c) 2026 zjukop3', 'Copyright (c) 2026')
  assert.ok(lintLicense(noHolder).findings.some(finding => finding.rule === 'copyright-holder-missing'))
})

test('a future year is an error, an old year is a warning', () => {
  const future = MIT_BODY.replace('2026', '2999')
  assert.ok(lintLicense(future).findings.some(finding => finding.rule === 'copyright-year-future'))
  const stale = MIT_BODY.replace('2026', '2019')
  assert.ok(lintLicense(stale).findings.some(finding => finding.rule === 'copyright-year-stale' && finding.level === 'warn'))
})

test('leftover template placeholders are errors', () => {
  const text = MIT_BODY.replace('2026 zjukop3', '<year> <copyright holders>')
  const result = lintLicense(text)
  assert.ok(result.findings.some(finding => finding.rule === 'placeholder-left'))
})

test('an empty file is one empty error', () => {
  const result = lintLicense('   \n')
  assert.equal(result.ok, false)
  assert.equal(result.findings[0].rule, 'empty')
})
