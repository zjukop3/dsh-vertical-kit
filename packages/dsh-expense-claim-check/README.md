# dsh-expense-claim-check

Expense-claim hygiene from a single file. A claim is decidable: **who** is claiming, the **period**, the **line items and whether they add up to the stated total**, duplicate **invoice numbers**, what each expense was **for**, and who **approved** it. This verifies exactly those — one file, no model call, no access to the accounting system.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
报销人：张三
报销期间：2026-11-01 至 2026-11-15

- 高铁票 553.50 元
- 住宿 960.00 元

合计：1600.00 元

```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ expense-claim-check claim-sample.md
error total-mismatch 第0行 明细相加是 1513.5，合计行写的是 1600，差 86.5（容差 0.01）——要么抄错，要么有一行没列出来
error approver-missing 第0行 没有审批人（认得：审批人：、批准人：、Approved by）——没有人批过的报销单不该进入付款
warn invoice-missing 第0行 一条发票号都没有（认得：发票号码：12345678）——没有发票号的明细无法在系统里核销
warn purpose-missing 第0行 没有事由说明（认得：事由、用途、Purpose）——只有金额的报销单，审批人无法判断该不该批
fail: 2 items summing 1513.5, total 1600, 2 errors, 2 warnings

```

出口码：1。
<!-- example:start -->

heck

Expense-claim hygiene from a single file. A claim is decidable: **who** is claiming, the **period**, the **line items and whether they add up to the stated total**, duplicate **invoice numbers**, what each expense was **for**, and who **approved** it. This verifies exactly those — one file, no model call, no access to the accounting system.

<!-- example:start -->

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `claimant-missing` | error | no 报销人/申请人/Claimant — the money cannot be booked to a person |
| `date-missing` | error | no date and no period — the claim cannot be assigned to an accounting period |
| `period-unlabelled` | warn | a single date with nothing saying it is the expense period |
| `items-missing` | error | no money-bearing line item — nothing to reconcile the total against |
| `total-missing` | error | no 合计/总计 line — the approver has to add it up by hand |
| `total-mismatch` | error | the line items do not sum to the stated total — the rule the package exists for |
| `invoice-duplicate` | error | the same invoice number appears twice — the most common form of double-claiming |
| `invoice-missing` | warn | line items with no invoice number at all |
| `purpose-missing` | warn | no 事由/用途 — an approver cannot judge a claim that lists only amounts |
| `category-missing` | warn | no expense category — the category decides which account it lands in |
| `approver-missing` | error | no 审批人/Approved by — an unapproved claim should not reach payment |
| `currency-mixed` | warn | more than one currency with no exchange rate, so the total has no unit |

Amounts are read to two decimals and must sit below ten million; invoice numbers and dates are stripped before amounts are parsed, so a fourteen-digit invoice number does not become a seventy-three-trillion-yuan line item. Currency is compared by code, not spelling: a bare 元 counts as CNY, and 美元/欧元 are matched before it so their 元 is not misread.

## Use

```bash
npx expense-claim-check claim.md --json
npx expense-claim-check - < claim.md
npx expense-claim-check claim.md --tolerance 0.02
```

Same function over HTTP: `POST /expense-claim-check/api` with `{"text": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Why the total is the point

Everything else on this list is visible at a glance. A claim whose lines add up to 1,525.50 but whose total says 1,600.00 looks entirely normal on the page: the numbers are tidy, the table is aligned, and the total is the number the approver actually reads. The difference is either a copy-paste from a previous claim or a round-up, and neither announces itself.

The same is true of a repeated invoice number. One claim, two lines, different dates, same invoice — nobody counts digits.

## Honest scope

This checks the document, not the expense: it can prove the lines add up and that no invoice number repeats inside this one file. It cannot know that invoice 24512000998877 was already claimed last month in a different claim, because that requires the ledger, not a Markdown parser. A claim can pass every rule here and still be a duplicate; this tool has nothing to say about that, and does not pretend otherwise.
