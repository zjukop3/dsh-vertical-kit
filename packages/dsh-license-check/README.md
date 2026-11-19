# dsh-license-check

LICENSE hygiene from one file. A license file is decidable in the three ways that cost real money when wrong: whether the body is a **recognized license** at all, whether the **title agrees with the body**, and whether the **copyright line names someone with a plausible year** — plus the template placeholders nobody notices until a lawyer reads the file.

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ license-check LICENSE.sample
error copyright-holder-missing 第3行 第 3 行 Copyright 没有版权人名称
fail: detected=MIT, 1 errors, 0 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `empty` | error | the file has no content |
| `unrecognized` | error | the body is not any known license text |
| `title-body-mismatch` | error | titled MIT, body is Apache — the reader trusts the title |
| `declared-mismatch` | error | `--expected` (your `package.json` license field) disagrees with the body |
| `copyright-missing` | error | no Copyright line — the grant has no identifiable holder |
| `copyright-year-missing` | error | a Copyright line with no year |
| `copyright-holder-missing` | error | a Copyright line with no name |
| `copyright-year-future` | error | a year that has not happened |
| `copyright-year-stale` | warn | a static past year — normal for a one-shot release, worth a look for a maintained project |
| `placeholder-left` | error | `<year>`, `<copyright holders>`, `[fullname]`, `{{…}}` never filled in |

Recognized bodies: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, GPL-2.0, GPL-3.0, LGPL-3.0, AGPL-3.0, MPL-2.0, Unlicense, CC0-1.0.

Identification matches **phrases from the license body**, not just the title — which is why a file titled "MIT License" whose text is the GPL is caught. BSD-3 is preferred over BSD-2 when both signatures are present, since BSD-3 contains BSD-2's opening.

## Use

```bash
npx license-check LICENSE --json
npx license-check LICENSE --expected MIT
```

Same function over HTTP: `POST /license-check/api` with `{"text": "…"}` or `{"path": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

This checks the file's **shape and identity**, not legal effect: it cannot tell you whether the license fits your business, whether your dependencies are compatible with it, or whether the copyright holder is the right legal entity. It verifies that the file says what it appears to say and that nothing was left as a template. That is the part a machine can be trusted with; the rest is for a lawyer.
