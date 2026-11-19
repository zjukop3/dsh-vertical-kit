# dsh-test-report-check

Test-report hygiene from markdown. A report is decidable: the **counts must add up** (passed + failed + skipped = total), the **environment** must be stated, and every failure needs **somewhere to start**. This verifies exactly those.

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# 测试报告

今天跑了测试，大部分都过了。
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ test-report-check test-sample.md
error counts-missing 第0行 全文没有任何用例计数（认得：通过 12、失败 3、跳过 1、总计 15）——测试报告没有计数就不是报告
error env-missing 第0行 没有测试环境（认得：## 测试环境、环境：…、OS：…、Node：v…）——不写环境的结果无法复跑
fail: {}, 2 errors, 0 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `counts-missing` | error | no case counts at all (通过 12 / failed 3 / total 15) |
| `sum-mismatch` | error | passed + failed + skipped ≠ total, with the arithmetic in the message |
| `env-missing` | error | no 测试环境 / 环境：/ OS：/ Node： line |
| `failure-detail-missing` | error | a non-zero failure count with no failure section |
| `total-missing` | warn | parts present, total absent — the reader cannot check the sum |
| `counts-partial` | warn | total present, parts absent |

## Use

```bash
npx test-report-check report.md --json
```

Same function over HTTP: `POST /test-report-check/api` with `{"text": "…"}` or `{"path": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

This checks the report's **bookkeeping**, not the test suite's quality: it verifies the numbers reconcile, the environment is named, and a failure has a place to read. Whether the tests actually cover anything is what coverage and review are for.

Part of [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit): industry-scenario checks, each one verb, each runnable without DSH.

MIT.
