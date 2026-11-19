# dsh-commit-msg-check

Commit-message hygiene from a single message. A commit is decidable: it has a **type prefix** from a known set, a **subject that fits a git log line**, a **blank line before the body**, and **breaking changes announced in a trailer** rather than buried in the subject. This verifies exactly those — one file, no git history needed.

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
修复登录页在弱网环境下偶发超时却没有任何反馈的问题，补上错误文案、重试按钮与失败提示，并新增三条回归测试，覆盖该路径、重试次数上限以及超时之后的状态回收逻辑
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ commit-msg-check commit-sample.txt
error subject-long 第1行 第 1 行主题 78 字，超过 72——git log 会折行，细节放正文
warn type-missing 第1行 第 1 行没有类型前缀（认得：feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert）——「修复登录页在弱网环境下偶发超时却没有任何反馈的问题，补上错误」这条是团队约定，不是 git log 的硬要求——想强制就传 rules.requireType: "error"
fail: type=- subject=78ch, 1 errors, 1 warnings (type policy: warn)
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `type-missing` | warn | no `type(scope): subject` prefix — a team convention, not a git requirement (see below) |
| `type-unknown` | warn | a type outside the known set (custom types are fine, just be deliberate) |
| `subject-long` | error | subject over the limit (default 72 — where `git log` wraps) |
| `subject-empty` | error | nothing after the colon |
| `subject-period` | warn | subject ends with a period — it is a title, not a sentence |
| `body-separator` | error | no blank line after the header — git would fold the body into the subject |
| `breaking-untrailed` | warn | `!` in the header but no `BREAKING CHANGE:` trailer in the body — tooling parses the trailer |

Known types: `feat fix docs style refactor perf test build ci chore revert`.

## Use

```bash
npx commit-msg-check .git/COMMIT_EDITMSG --json
npx commit-msg-check msg.txt --max-subject 50
npx commit-msg-check msg.txt --require-type      # prefix becomes an error
npx commit-msg-check msg.txt --no-require-type   # drop the finding entirely
```

As a git hook, `.git/hooks/commit-msg`:

```sh
#!/bin/sh
npx commit-msg-check "$1" || exit 1
```

Same function over HTTP: `POST /commit-msg-check/api` with `{"text": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Two kinds of rule, two levels

Not every rule here is the same kind of claim, and the levels say so.

**Convention-neutral — errors.** A subject past 72 characters wraps in `git log`. A trailing period reads as a truncated sentence. A missing blank line folds the body into the subject. A `!` without a `BREAKING CHANGE:` trailer loses what the release tooling parses. Every repository, in every language, is wrong the same way.

**Convention-carrying — a warning.** `feat:`/`fix:` is the Conventional Commits spec, not a git requirement. Plenty of good repos write `Verb noun`, and a Chinese subject has no English type word to offer. Flagging those as errors is not catching a mistake, it is imposing a house style on a stranger — and a check that blocks every commit of a repo that never adopted that style gets uninstalled on the first commit. So `type-missing` is a `warn`, and teams that do use Conventional Commits turn it into an error with `--require-type` (or `rules.requireType: 'error'`).

Measured on this project's own three repositories, 102 real commits: 85 (83%) had no type prefix, and 58 (56%) had a subject over 72 characters. Under a default error the first number made the tool unusable on a codebase that is perfectly fine; the second number was a real defect in those commits and stayed an error.

## Honest scope

This checks the message's **shape**, not the commit's content: it verifies the message is parseable by tooling and readable in a log. Whether the diff does what the subject claims is what review is for. A message can pass every rule here and still describe the wrong change — this tool has nothing to say about that, and does not pretend otherwise.
