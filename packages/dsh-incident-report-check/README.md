# dsh-incident-report-check

Incident postmortem hygiene from markdown. A postmortem is decidable: it puts events on a **timestamped timeline**, states **who and what was affected** and **for how long**, names a **root cause** rather than a symptom, and gives **every follow-up an owner**.

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# 服务挂了

今天下午服务挂了，重启后恢复了。
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ incident-report-check incident-sample.md
error timeline-missing 第0行 没有时间线（认得：## 时间线 / ## 事件过程 + 带时间的条目）——没有时间的事故报告回答不了「挂了多久」
error impact-missing 第0行 没有影响段（认得：## 影响、影响：…、受影响…）——不知道影响谁的报告无法定级
error root-cause-missing 第0行 没有根因段（认得：## 根因、根本原因：…、root cause）——「重启后恢复」是处置，不是原因
error actions-missing 第0行 没有后续行动项（认得：## 行动项 / ## 后续 + 条目）——没有后续的复盘只写了一份文档
warn duration-missing 第0行 全文没有时长（认得：23 分钟、1 小时、45 秒）——读者要自己拿时间线相减才知道挂了多久
fail: 0 timeline entries, 0 follow-ups, 4 errors, 1 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `timeline-missing` | error | no 时间线/事件过程 section — a report without times cannot answer "how long were we down" |
| `timeline-entry-untimed` | error | a timeline entry with no time on it, named with its line |
| `impact-missing` | error | no 影响 section or line — a report that does not say who was affected cannot be graded |
| `root-cause-missing` | error | no 根因 section — 「重启后恢复」 is a remedy, not a cause |
| `actions-missing` | error | no follow-up items — a postmortem with no follow-ups is a document, not a fix |
| `action-no-owner` | error | a follow-up with no 负责人 / @name |
| `timeline-thin` | warn | fewer timeline entries than the floor (default 2) |
| `duration-missing` | warn | no duration anywhere (23 分钟 / 1 小时 / 45 秒 / 1h20m) |

Times recognized: `14:02`, `14:02:05`, `2026-11-18 14:02`, `2:32 PM`.

## Use

```bash
npx incident-report-check postmortem.md --json
npx incident-report-check postmortem.md --min-timeline 4
```

Same function over HTTP: `POST /incident-report-check/api` with `{"text": "…"}` or `{"path": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

This checks the postmortem's **structure**, not whether it found the real cause: a report can name a plausible root cause that is wrong, and this tool cannot tell. It verifies the document states a timeline, an impact, a cause, and owned follow-ups — the four things a reader needs before they can evaluate the analysis. Blame-free review is a human practice; this check does not encode one, and does not reward naming a person over naming a mechanism.

## Note for anyone writing a check like this

JavaScript's `\b` needs a `\w` neighbour, and CJK characters are not `\w` — so `分钟\b` never matches. This package's duration rule splits the CJK units from the ASCII ones for exactly that reason; a pattern copied from an English-only linter will silently never fire on Chinese text.
