# dsh-handover-check

Handover-document hygiene from a single file. A handover is decidable: **who** is leaving, **who** takes over, **when** it is effective, **what** is listed, **which accounts and permissions** move, **what is unfinished**, and whether the receiver **signed for it**. This verifies exactly those — one file, no model call, no access to the systems being handed over.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# 交接单

交接人：张三
接收人：李四
2026-11-19

1. 事项一
2. 事项二
3. 事项三

```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ handover-check handover-sample.md
error access-unlisted 第0行 没有账号/权限段（认得：## 账号与权限、账号：、Access）——交接单不列账号，等于留下一组没人管的活凭证
error signoff-missing 第0行 没有接收人签字/确认（认得：## 签字确认、已确认、Sign-off）——没签字就没有人核对过交接是否完整
warn date-unlabelled 第0行 全文有日期 2026-11-19，但没有「交接日期/生效日期」字样
warn no-owners 第0行 3 条事项里没有一条写了负责/接手人——接手人只能自己猜从哪开始
warn pending-missing 第0行 没有未完成/遗留事项段（认得：## 未完成事项、遗留：、Known issues）——只看已完成的部分，接手人会在第二周撞墙
fail: 3 items, 2 errors, 3 warnings
```

出口码：1。
<!-- example:start -->

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `handover-person-missing` | error | no 交接人/移交人/Handover by — nobody owns the handover |
| `receiver-missing` | error | no 接收人/接手人/Receiver — nobody takes over, so nothing was handed over |
| `date-missing` | error | no handover date — without an effective date you cannot tell which version is authoritative |
| `date-unlabelled` | warn | a date is present but nothing says it is the handover date |
| `items-thin` | error | fewer than three listed items — a two-item handover is a handover that forgot something |
| `no-owners` | warn | not one item names who负责/接手 it |
| `access-unlisted` | error | no accounts/permissions section — the handover that leaves a live credential behind |
| `access-empty` | warn | an accounts section that names no concrete account; write 无账号需交接 if there genuinely are none |
| `pending-missing` | warn | no 未完成/遗留 section — the receiver walks into it in week two |
| `signoff-missing` | error | no receiver sign-off — nobody checked that the handover is complete |

Counts are taken inside the 交接事项 section when one exists, so a long accounts list cannot make a thin handover look substantial. Emails, host names, provider names (GitHub, npm, AWS, 阿里云, Jenkins, VPN, SSH, 数据库, …) and the words 账号/权限/密钥/token count as named accounts.

## Use

```bash
npx handover-check handover.md --json
npx handover-check - < handover.md
```

Same function over HTTP: `POST /handover-check/api` with `{"text": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## A label is not a person

`接收人：尚未指定` used to pass. The rule looked for the label and never for a name, so a handover that writes down "nobody has taken this over yet" was treated as having a receiver.

Found by writing this project's own handover honestly — it says exactly that, and the check said everything was fine.

The receiver slot now rejects non-answers: 尚未…, 未指定, 待定, 待指派, 暂无, 没有, 无, TBD, N/A, none, or a bare dash. A real name passes, with or without a team in parentheses, with or without a trailing note.

## Why the accounts rule is the point

Signature and date are the parts a reviewer notices without help. The accounts section is the part nobody notices: a handover that forgets one read-only console login does not fail today, it fails at the next audit — by which time the person who knew about it has left.

So `access-unlisted` is an error, and it can be satisfied honestly by writing 无账号需交接. The exemption has to be written down; silence is what the rule refuses.

## Measured against real HANDOVER.md files

Three public `HANDOVER.md` files (`crshdn/mission-control`, `terraphim/terraphim-ai`, `Ferris-echo/FerrisPulse`) were run through this check, and all three turned out to be the **other genre**: session handovers written for the next agent or the next session (`Current State`, `What Was Done This Session`, `Files Changed`; one of them in Chinese as 「接棒 Agent 关键须知」). None has a receiver, an account transfer or a sign-off, so judging them with the people-handover rules produced seven findings on every file. The check now detects that genre and returns a single `technical-handover` warning naming the mismatch. A people handover with 交接人/接收人 is unaffected.

## Honest scope

This checks the document, not the handover: it can tell you the accounts section exists and names something, never that the access was actually revoked. Verifying that needs a comparison against the systems themselves — an inventory diff, not a Markdown parser. A handover can pass every rule here and still leave a token alive; this tool has nothing to say about that, and does not pretend otherwise.
