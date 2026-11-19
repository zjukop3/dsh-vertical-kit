# dsh-pr-description-check

Pull-request description hygiene from the body text. A PR description answers the reviewer's first three questions, and that makes it decidable: **what changed**, **why**, and **how the author knows it works** — plus the issue it closes, any breaking change paired with a migration note, and whether the checklist was actually read.

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
修了点东西
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ pr-description-check pr-sample.md
error what-missing 第0行 没有「做了什么」段（认得：## 概述、## 变更、这个 PR…、或一条列出改动的列表）——reviewer 只能从 diff 反推意图
error test-missing 第0行 没有测试/验证说明（认得：## 测试、验证：…、How tested、测试数/audit/CI 结果）——没有验证说明的 PR 让 reviewer 替你验证
warn why-missing 第0行 没有「为什么」段（认得：## 背景、## 动机、the reason is、动机是）——这条靠判断不靠关键词，想让它在 CI 里阻断就传 rules.requireWhy: "error"
warn issue-unlinked 第0行 没有关联 issue（认得：Fixes #12、#56）——小改动可以没有，但追溯性会差一些
fail: 0 checkboxes, 2 errors, 2 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `empty` | error | the body is blank — the reviewer can only guess intent from the diff |
| `what-missing` | error | no 概述/变更/What section, and no bullet list of the changes |
| `why-missing` | warn | no 背景/动机/Why section, and no motive phrase — a diff shows what changed, never why (see below) |
| `test-missing` | error | no 测试/验证/How tested — a description without it asks the reviewer to verify for you |
| `issue-missing` | error | `--require-issue` and no linked issue |
| `issue-unlinked` | warn | no `Fixes #12` / `#34` / issue URL — small fixes legitimately arrive without one |
| `breaking-without-migration` | error | a breaking change mentioned with no 迁移/upgrade note |
| `checklist-unchecked` | warn | every box in the checklist is unchecked — the template was kept, the thinking was not done |

## Use

```bash
npx pr-description-check .github/pull_request_body.md --json
gh pr view 42 --json body --jq .body | npx pr-description-check - 
npx pr-description-check body.md --require-issue
```

The CLI reads `-` from stdin, so it drops straight into a `gh` pipeline. Same function over HTTP: `POST /pr-description-check/api` with `{"text": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Motive is a warning, and the other two are not

`what-missing` and `test-missing` are decidable enough to be errors: a description either lists its changes or does not, and either names a verification artifact — a test count, an audit, a CI result — or does not. Evidence counts whether or not it sits under a heading, and fenced blocks are masked, so pasting a stack trace or this check's own output does not satisfy it.

`why-missing` is a warning, for the reason the dogfood made plain. Whether a body states a *motive* cannot be settled by keywords: `because` shows up in explanations of code far more often than in reasons. One of this project's own merged PRs passed `why-missing` on the strength of the sentence 「because `#` is a non-word character」 — a regex note, not a motivation. A narrower phrase list fixes that case and breaks the next one. So the rule states what it can: if the section or a motive phrase is absent, say so, and let a human decide. `--require-why` (or `rules.requireWhy: 'error'`) makes it blocking for teams that want that; `--no-require-why` drops the finding.

Measured on this project's **19 merged catalog PRs**: under the old heading-only rules, 19 of 19 were reported as missing `what`, `why` *and* `test` — every question answered in prose, none of it labelled. Two were also reported as declaring a breaking change, because their bodies described the package («breaking changes announced in a `BREAKING CHANGE:` trailer»). After the fixes: 1 of 19 has an error, and it is a genuinely thin old body that names no verification.

## Honest scope

This checks the description's **shape**, not whether it is true: it cannot tell that the summary describes a different change, that the test claim is fiction, or that the issue link points somewhere unrelated. It verifies the text answers what/why/how-verified in a form a reviewer can act on. Whether the answers are honest is what review and CI are for — a tool that tried to judge honesty would be guessing.
