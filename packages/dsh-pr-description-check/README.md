# dsh-pr-description-check

Pull-request description hygiene from the body text. A PR description answers the reviewer's first three questions, and that makes it decidable: **what changed**, **why**, and **how the author knows it works** — plus the issue it closes, any breaking change paired with a migration note, and whether the checklist was actually read.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
修了点东西
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ pr-description-check pr-sample.md
error what-missing 第0行 没有「做了什么」段（认得：## 概述、## 变更、这个 PR…）——reviewer 只能从 diff 反推意图
error why-missing 第0行 没有「为什么」段（认得：## 背景、## 动机、因为…）——diff 说明改了什么，改不了改的理由
error test-missing 第0行 没有测试/验证说明（认得：## 测试、验证：…、How tested）——没有验证说明的 PR 让 reviewer 替你验证
warn issue-unlinked 第0行 没有关联 issue（认得：Fixes #12、#56）——小改动可以没有，但追溯性会差一些
fail: 0 checkboxes, 3 errors, 1 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `empty` | error | the body is blank — the reviewer can only guess intent from the diff |
| `what-missing` | error | no 概述/变更/What section |
| `why-missing` | error | no 背景/动机/Why section — a diff shows what changed, never why |
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

## Honest scope

This checks the description's **shape**, not whether it is true: it cannot tell that the summary describes a different change, that the test claim is fiction, or that the issue link points somewhere unrelated. It verifies the text answers what/why/how-verified in a form a reviewer can act on. Whether the answers are honest is what review and CI are for — a tool that tried to judge honesty would be guessing.
