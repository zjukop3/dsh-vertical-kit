# dsh-bug-report-check

Bug-report hygiene from markdown. A bug report is decidable: it must say **where** it happened (environment), **how** to hit it (numbered steps), and **what differs** (expected vs actual). This verifies exactly those.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# 登录按钮在 Safari 下无响应

今天有人反馈说登录不行。
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ bug-report-check bug-sample.md
error env-missing 第0行 没有环境信息（认得：## 环境、版本：x.y.z、OS：…、Node：v…）——没有环境的 bug 无法归因
error repro-missing 第0行 没有复现步骤（认得：## 复现步骤 + 编号步骤）——没有步骤的 bug 无法验证
error expected-actual-missing 第0行 没有「预期」与「实际」的对照（认得：预期：…、实际：…、Expected/Actual）——没有对照就不是 bug 描述
fail: 0 steps, 3 errors, 0 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `title-missing` | error | no `# title` on the first line |
| `env-missing` | error | no 环境 / 版本：/ OS：/ Node： line or heading |
| `repro-missing` | error | no numbered steps under a 复现/Steps section |
| `expected-actual-missing` | error | neither 预期 nor 实际 stated |
| `expected-missing` | error | 实际 present, 预期 absent |
| `actual-missing` | error | 预期 present, 实际 absent |
| `repro-thin` | warn | fewer steps than the floor (default 3) |

## Use

```bash
npx bug-report-check report.md --json
npx bug-report-check report.md --min-steps 5
```

Same function over HTTP: `POST /bug-report-check/api` with `{"text": "…"}` or `{"path": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

This checks the report's **bookkeeping**, not the bug's severity: it verifies the report says where, how, and what. Whether the bug is real is what reproduction is for. A narrative description without numbered steps is reported as `repro-missing` — prose cannot be replayed.

Part of [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit): industry-scenario checks, each one verb, each runnable without DSH.

MIT.
