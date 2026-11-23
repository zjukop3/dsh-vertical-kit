# dsh-perf-report-check

Performance-report hygiene from markdown — load test or micro-benchmark, since the two share a file name. A performance report answers three questions and is worthless without them: **under what conditions** (concurrency, rate, iterations, dataset size), **what came out** (a distribution or at least a median over N runs), and **compared to what** (a baseline). Two more make it repeatable: the environment, and the command that produced the numbers.

The metric rule is why this package exists. One number from one run is not a result: an average hides the tail, and the tail is what users feel. A report that says 「平均 4.9 秒」 tells a reader nothing about the p99 that paged someone at 3am.

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# 首页接口压测

## 测试环境

机器：8 核 16G

## 结果

20 并发下很慢，平均 4.9 秒。

```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ perf-report-check perf-sample.md
error latency-missing 第0行 没有可比较的度量（认得：p50 340ms、p95、中位数 191ms、33 906 files/s、7-run medians）——单次跑出来的一个数字说明不了分布
warn baseline-missing 第0行 没有基线对照（认得：基线、优化前、对照、baseline）——没有对照的数字，读者不知道这是好还是坏
warn repro-missing 第0行 没有复现方式（认得：## 复现、locust、k6、wrk 命令）——别人无法验证这组数字
fail: 0 percentiles, 1 errors, 2 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `title-missing` | error | no `# title` in the first few lines |
| `load-missing` | error | no conditions stated — concurrency, rate, rounds, `7-run`, dataset size |
| `latency-missing` | error | no comparable metric — percentiles, throughput, `median of 3 reps`, `best 0.65ms` |
| `env-missing` | error | no environment — machine, CPU, threads, platform, dataset scale |
| `baseline-missing` | warn (error with `--strict`) | no comparison — baseline, 优化前, `191.2 ms → 2.2 ms`, `87×` |
| `conclusion-missing` | warn (error with `--strict`) | no verdict section — 结论, Findings, Recommendation, 结果分析 |
| `repro-missing` | warn (error with `--strict`) | no way to reproduce — locust/k6/wrk, a script path, a harness |

## Use

```bash
npx perf-report-check report.md --json
npx perf-report-check report.md --strict --warnings-fail
```

Same function over HTTP: `POST /perf-report-check/api` with `{"text": "…"}` or `{"path": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Measured against real reports

Six public reports were run through this check: one load test with p50/p95/p99 (`dataelement/bisheng`), and five benchmark comparisons — `asdecided/core`, `gdsge/gdsge`, `Danceiny/gotry`, `Simon-He95/markdown-it-ts`, `qusong0627/QuantMind`. Four pass clean. One keeps a single `conclusion-missing` warning; the last is a 906-byte backtest note that legitimately has no load definition, no metric and no environment.

Four fixes came out of the measurement, all the same shape — a rule that knew one spelling of a section:

- the title need not be line 1 (a language-switch line came first)
- the verdict section is called `Findings`, `Go / no-go recommendation`, `结果分析`
- 「median of 3 reps」, 「medians of 7 warm runs」 and 「best: 0.65ms」 are all comparable metrics
- a platform name and a thread count (`PCWIN64, 8 compute threads`) is the environment

## Honest scope

This checks whether the report **can be read and reproduced**, not whether the numbers are right. It cannot tell a real p95 from a fabricated one, cannot judge whether the load profile resembles production, and cannot verify that the baseline was measured on comparable hardware. Re-running the harness is what catches those.

If your document is a unit-test report (pass/fail counts, failure details), use `dsh-test-report-check` instead — that one recognises this genre and points back here.

Part of [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit): industry-scenario checks, each one verb, each runnable without DSH.

MIT.