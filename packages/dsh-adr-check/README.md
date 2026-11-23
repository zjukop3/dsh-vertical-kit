# dsh-adr-check

Architecture decision record hygiene from markdown. An ADR is decidable: a **status**, the **context** that forced a choice, the **decision** in one sentence, **consequences that include the cost**, and the **alternatives that lost**. The rule that earns the package is the fourth one — an ADR whose consequences list only benefits did not weigh the trade.

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# ADR-0007 用 Postgres 存会话

## 背景

会话要跨实例共享。

## 决定

会话写入 Postgres。

## 后果

- 好处：多副本共享，重启不丢会话
- 好处：不再需要粘性会话
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ adr-check adr-sample.md
error status-missing 第0行 没有状态（认得：状态：已接受、Status: accepted，或「## Status」下面一行）——不知道这条决策是否已生效。可取值：proposed/accepted/rejected/deprecated/superseded…
warn date-missing 第0行 没有日期（认得：2026-11-18）——决策的时间点决定了它的上下文
warn consequences-one-sided 第13行 后果段只有好处没有代价（缺：代价/缺点/风险/trade-off）——只写收益的 ADR 通常没真正权衡过
fail: 2 consequences, 1 errors, 2 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `empty` | error | the record has no content |
| `status-missing` | error | no status — either a 状态/Status line or the line under a `## Status` heading (the Nygard template) |
| `context-missing` | error | no 背景/Context section — without the constraints, nobody can re-evaluate the decision later |
| `decision-missing` | error | no 决定/Decision section |
| `consequences-missing` | error | no 后果/Consequences section |
| `consequences-one-sided` | warn | consequences list benefits with no cost — the trade was not weighed |
| `consequences-unlabelled` | warn | consequences label neither benefit nor cost, so the reader cannot tell which is which |
| `alternatives-missing` | warn, **off by default** (`--require-alternatives`) | no 备选/Alternatives section — only the winning option, so no record that there was a choice |
| `status-unknown` | warn | a status outside the common set |
| `date-missing` | warn | no date — when it was decided is part of its context |

Status values recognized: `proposed` `accepted` `rejected` `deprecated` `superseded` (and 提议/已接受/已采纳/已拒绝/已废弃/已取代/草案/draft).

Cost words: 代价 缺点 劣势 风险 成本 不利 / trade-off downside drawback risk cost negative.
Benefit words: 好处 优点 优势 收益 / benefit advantage upside positive.

## Use

```bash
npx dsh-adr-check docs/adr/0007-postgres-sessions.md --json
npx dsh-adr-check - < adr.md
```

Same function over HTTP: `POST /adr-check/api` with `{"text": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Where the balance rule looks

The cost/benefit judgement reads the **whole 后果 section**, not just its bullets. An ADR that writes `好处：` on its own line and then lists the benefits has labelled the trade, and earlier versions of this check called that unlabelled because the label sat outside the list — the same "measured the spelling, not the property" mistake that cost four other checks in this kit a release. Labels on their own line count now.

Measured against five real ADRs from `npryce/adr-tools`: 4 pass with no findings; the fifth warns `consequences-unlabelled` because its consequences are unlabelled prose. Before that measurement, all five failed with `status-missing` — the rule only knew `Status: accepted` on one line, not the `## Status` section that the Nygard template (and every one of those five) uses.

## Honest scope

This checks the record's **shape**, not whether the decision was right: it cannot tell that the context omits a constraint everyone knew, that the alternatives were strawmen, or that the cost was understated to get the decision approved. It verifies the record states a status, a context, a decision, consequences that name a cost, and the alternatives — the five things a future reader needs to disagree with it. Whether the decision was good shows up in the consequences, later.
