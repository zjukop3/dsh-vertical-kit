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

// The copyright rules were reading the first line that mentions the word, which
// in Apache-2.0 is the definitions section: `"Licensor" shall mean the copyright
// owner…`. Four of twenty-one third-party LICENSE files were reported as missing
// both a year and a holder because of it.
test('the Apache definitions line is not a copyright notice', () => {
  const apache = `                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.
`
  const result = lintLicense(apache)
  assert.ok(!result.findings.some(f => f.rule === 'copyright-year-missing'), JSON.stringify(result.findings.map(f => f.rule)))
  assert.ok(!result.findings.some(f => f.rule === 'copyright-holder-missing'))
})

test('an unfilled appendix slot warns, it does not error', () => {
  // Apache-2.0, MPL-2.0 and the GPL family all carry
  // `Copyright [yyyy] [name of copyright owner]` in their appendix; most correct
  // projects never fill it. Detected as Apache, so the slot is advice.
  const withTemplate = `                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

   Copyright [yyyy] [name of copyright owner]
`
  const result = lintLicense(withTemplate)
  assert.ok(result.findings.every(f => f.level === 'warn'), JSON.stringify(result.findings))
  assert.ok(result.ok, 'an unfilled appendix slot must not fail the file')
})

test('a filled notice is judged normally, and a future year is still wrong', () => {
  const mit = `MIT License

Copyright (c) 2026 Someone

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction.
`
  const ok = lintLicense(mit)
  assert.ok(!ok.findings.some(f => f.rule.startsWith('copyright')), JSON.stringify(ok.findings))

  const future = lintLicense(mit.replace('2026', '2099'))
  assert.ok(future.findings.some(f => f.rule === 'copyright-year-future'))
})

test('a self-written body with a placeholder left is still an error', () => {
  // No recognized license means nobody agreed to the text yet, so a slot left in
  // it is a defect rather than an appendix convention.
  const custom = `项目使用许可

Copyright (c) <year> <name of author>

你可以自由使用本项目。
`
  const result = lintLicense(custom)
  const finding = result.findings.find(f => f.rule === 'placeholder-left')
  assert.ok(finding, JSON.stringify(result.findings.map(f => f.rule)))
  assert.equal(finding.level, 'error')
})

test('a title that disagrees with the body is still the headline error', () => {
  // The real case: a third-party LICENSE titled MIT whose body is AGPL-3.0.
  const mismatched = `MIT License

                    GNU AFFERO GENERAL PUBLIC LICENSE
                       Version 3, 19 November 2007

   Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
`
  assert.ok(lintLicense(mismatched).findings.some(f => f.rule === 'title-body-mismatch'))
})

test('the appendix template slot is reported once, as a warning', () => {
  // notice-template-unfilled exists so an unfilled Apache appendix produces one
  // calm warning instead of two angry errors. The rules audit caught that it had
  // no firing test.
  const apache = `Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

   Licensed under the Apache License, Version 2.0 (the "License").

   Copyright [yyyy] [name of copyright owner]
`
  const result = lintLicense(apache)
  const finding = result.findings.find(f => f.rule === 'notice-template-unfilled')
  assert.ok(finding, JSON.stringify(result.findings.map(f => f.rule)))
  assert.equal(finding.level, 'warn')
  assert.equal(result.errors, 0, 'an unfilled appendix must not produce an error')
  assert.equal(result.findings.filter(f => f.rule === 'notice-template-unfilled').length, 1, 'reported once')
})

test('a filled notice produces no template warning', () => {
  const apache = `Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

   Copyright 2026 zjukop3
`
  assert.ok(!lintLicense(apache).findings.some(f => f.rule === 'notice-template-unfilled'))
})
