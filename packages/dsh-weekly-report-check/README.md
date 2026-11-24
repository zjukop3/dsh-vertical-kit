# dsh-weekly-report-check

Weekly-report hygiene from markdown. A 周报 is decidable in its **structure**: it must separate what was **done** from what is **planned**, name the **risks and blockers**, and carry enough **numbers** that a reader can tell progress from motion. This verifies exactly those and names the missing section.

<!-- install:start -->
## 装进 DSH

```bash
dsh plugin --profile <profile> add dsh-weekly-report-check
```

`--profile` 是 `dsh plugin` 的必填项（Desktop 用 `desktop`，Web 用 `web`）。装完在「插件」里启用，对话中就有这条检查的 host 路由；不装 DSH 也能用上面的 `npx`。
<!-- install:end -->

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# 周报 2026-W46

这周很忙，做了很多事情，下周继续努力。
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ weekly-report-check weekly-sample.md
error done-missing 第0行 没有「本周完成」段或自标识行（认得：## 本周完成、已完成：…、已上线…）——报告没有事实底座
warn risks-missing 第0行 没有风险/阻塞段（认得：## 风险、阻塞：…、卡在…）——如果本周真的没有风险，忽略这条
warn metrics-thin 第0行 全文只有 0 行带量化数字（% 、个、条、次、人、天、小时…，下限 1）——「优化了性能」不可检验，「p95 从 820ms 降到 460ms」可以
fail: 0 done, 1 planned, 0 risks, 1 errors, 2 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `done-missing` | error | no 本周完成 section or self-identifying line (已完成…、已上线…) |
| `plan-missing` | error | no 下周计划 section or self-identifying line (计划…、下周…) |
| `risks-missing` | warn | no 风险/阻塞 section — the message says to ignore it if the week was quiet |
| `metrics-thin` | warn | fewer quantified lines than the floor (default 1) —「优化了性能」不可检验，「p95 从 820ms 降到 460ms」可以 |

Bullets under a section heading are its items; lines that self-identify (本周完成：…、阻塞：…) count without a heading. Section markers and already-collected bullets are never double-counted.

## Use

```bash
npx dsh-weekly-report-check report.md --json
npx dsh-weekly-report-check report.md --min-metrics 3
```

Same function over HTTP: `POST /weekly-report-check/api` with `{"text": "…"}` or `{"path": "…"}`, optional `{"rules": {"minMetrics": 3}}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

This checks the report's **structure**, not the work's truth: it verifies the note separates done from planned, names risks, and quantifies at least one line. Whether the work actually happened is what the demo and the diff are for. A vacuous promise (「下周继续努力」) reads as a plan statement to this check — presence is decidable, substance is not.
