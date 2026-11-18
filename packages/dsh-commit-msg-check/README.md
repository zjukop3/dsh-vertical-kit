# dsh-commit-msg-check

Commit-message hygiene from a single message. A commit is decidable: it has a **type prefix** from a known set, a **subject that fits a git log line**, a **blank line before the body**, and **breaking changes announced in a trailer** rather than buried in the subject. This verifies exactly those — one file, no git history needed.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
修了几个 bug
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ commit-msg-check commit-sample.txt
error type-missing 第1行 第 1 行没有类型前缀（认得：feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert）——「修了几个 bug」看不出这次改动的性质
fail: type=- subject=8ch, 1 errors, 0 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `type-missing` | error | no `type(scope): subject` prefix — a bare sentence does not say what kind of change it is |
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
```

As a git hook, `.git/hooks/commit-msg`:

```sh
#!/bin/sh
npx commit-msg-check "$1" || exit 1
```

Same function over HTTP: `POST /commit-msg-check/api` with `{"text": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

This checks the message's **shape**, not the commit's content: it verifies the message is parseable by tooling and readable in a log. Whether the diff does what the subject claims is what review is for. A message can pass every rule here and still describe the wrong change — this tool has nothing to say about that, and does not pretend otherwise.
