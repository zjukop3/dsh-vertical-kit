# dsh-vertical-kit

Industry-scenario checks for deliverables an agent produced and a person is about to accept. The generic defects (ragged tables, broken citations) live in [dsh-verify-kit](https://github.com/zjukop3/dsh-verify-kit); this kit covers the vocabulary of specific trades.

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) — catalog pages: [dsh-agreement-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-agreement-check/) · [dsh-invoice-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-invoice-check/) · [dsh-listing-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-listing-check/) · [dsh-meeting-notes-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-meeting-notes-check/) · [dsh-resume-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-resume-check/) · [dsh-release-notes-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-release-notes-check/) · [dsh-weekly-report-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-weekly-report-check/) · [dsh-bug-report-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-bug-report-check/) · [dsh-api-doc-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-api-doc-check/) · [dsh-test-report-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-test-report-check/) · [dsh-commit-msg-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-commit-msg-check/) · [dsh-dockerfile-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-dockerfile-check/) · [dsh-env-example-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-env-example-check/) · [dsh-license-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-license-check/) · [dsh-incident-report-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-incident-report-check/) · [dsh-ops-runbook-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-ops-runbook-check/) · [dsh-pr-description-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-pr-description-check/) · [dsh-spec-doc-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-spec-doc-check/) · [dsh-adr-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-adr-check/) · [dsh-onboarding-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-onboarding-check/).

| package | trade | what it decides |
| --- | --- | --- |
| [dsh-agreement-check](packages/dsh-agreement-check) | legal / procurement | parties named, date present, uppercase amount matches the digits, signature block, dispute and breach clauses |
| [dsh-invoice-check](packages/dsh-invoice-check) | finance | credit-code alphabet, net + tax = total, uppercase vs printed total, invoice-number shapes |
| [dsh-listing-check](packages/dsh-listing-check) | e-commerce ops | title bounds, keyword repetition, price validity, SKU completeness and duplicates |
| [dsh-meeting-notes-check](packages/dsh-meeting-notes-check) | white-collar universal | date present, attendees named, decisions recorded, every action item with an owner and a deadline |
| [dsh-resume-check](packages/dsh-resume-check) | hiring | reachable contact block, valid email/phone shapes, a work timeline that never overlaps itself, education section |
| [dsh-release-notes-check](packages/dsh-release-notes-check) | dev-facing delivery | version heading, date, breaking changes paired with an upgrade path, newest-first ordering |
| [dsh-weekly-report-check](packages/dsh-weekly-report-check) | white-collar universal | done separated from planned, risks named, at least one quantified line |
| [dsh-bug-report-check](packages/dsh-bug-report-check) | engineering | title, environment, numbered repro steps, expected vs actual |
| [dsh-api-doc-check](packages/dsh-api-doc-check) | engineering | method+path endpoints, examples, auth model, error shape |
| [dsh-test-report-check](packages/dsh-test-report-check) | engineering | counts that reconcile, environment, failure detail for every failure |
| [dsh-commit-msg-check](packages/dsh-commit-msg-check) | engineering | subject length, no trailing period, blank line, breaking trailer (type prefix warns; `--require-type` makes it an error) |
| [dsh-dockerfile-check](packages/dsh-dockerfile-check) | engineering / ops | pinned base, non-root USER, no secrets in layers, COPY over ADD, package cleanup |
| [dsh-env-example-check](packages/dsh-env-example-check) | engineering / ops | placeholders only, no committed credential, no duplicate key, purpose comments |
| [dsh-license-check](packages/dsh-license-check) | legal / open source | recognized body, title matches body, copyright holder and year, no leftover template |
| [dsh-incident-report-check](packages/dsh-incident-report-check) | SRE / ops | timestamped timeline, impact and duration, root cause not remedy, owned follow-ups |
| [dsh-ops-runbook-check](packages/dsh-ops-runbook-check) | SRE / ops | prerequisites, numbered steps, rollback, verification, warning beside every destructive command |
| [dsh-pr-description-check](packages/dsh-pr-description-check) | engineering | what / why / how-verified, linked issue, breaking change with migration, no unchecked checklist |
| [dsh-spec-doc-check](packages/dsh-spec-doc-check) | product / engineering | problem stated, checkable acceptance criteria, explicit out-of-scope, no wish-as-criterion |
| [dsh-adr-check](packages/dsh-adr-check) | architecture | status, context, decision, consequences including cost, alternatives considered |
| [dsh-onboarding-check](packages/dsh-onboarding-check) | developer experience | prerequisites, pasteable command, expected output, help path, time estimate |
| [dsh-handover-check](packages/dsh-handover-check) | HR / ops handover | who hands over, who takes over, effective date, listed items and owners, accounts named (or explicitly none), unfinished work, receiver sign-off |
| [dsh-expense-claim-check](packages/dsh-expense-claim-check) | finance / reimbursement | claimant, period, line items that must sum to the stated total, duplicate invoice numbers, purpose and category, approver, single currency |

Design rules, unchanged from verify-kit:

- **A check must be decidable from the file.** No model calls. A rule that needs judgment is not a rule; this kit states comparisons and reports the row and line that failed.
- **A finding names its row.** "第 3 行甲方名称为空" is actionable; "party information may be incomplete" is not.
- **These are checklists, not professionals.** dsh-agreement-check says a contract is structurally reviewable; it never says it is a good contract. dsh-invoice-check verifies arithmetic; it never verifies a business.
- **The route and the CLI call the same function**, so a check that passes in CI cannot fail in the panel. Measured, not assumed: `test/route-parity.test.js` calls each package's `apply()` with a minimal host context, serves the registered handler over a real socket, and compares the HTTP response to the direct call byte for byte — 22 packages, plus GET→405 and empty-body→400 for each.

```bash
npm test   # 278 tests, no network
```

## 两道闸

`npm run check` 除了检查包元数据，还会跑两道防"半条规则"的闸。

**规则双向审计**（`scripts/audit-rules.mjs`）。每条规则必须在测试里被观察到两个方向：一个坏文档让它报出来，一个好文档让它闭嘴。一个只被观察到会报的规则是半条规则——缺的那半决定了陌生人装完第一天会不会卸掉它。四个包就是因为只有前半条而全部误报：commit-msg 对 83% 的真实历史报错、onboarding 对 20/23 个真实 README 报错、release-notes 对 Keep a Changelog 的标准格式报错、pr-description 对 19/19 个真实已合并 PR 报错。这道闸跑出 168 条规则里的 168 条都有两个方向，并在过程中发现**三**条**永不触发**的死规则（本 kit 的 `subject-empty`、`sku-empty`，以及 verify-kit 的 `empty-heading`——标题正则要求非空文本，而「标题文字被删空」正是那条规则的理由），三条都已改成可达。

**Dogfood 闸**（`test/dogfood.test.js`）。把每个检查指向本项目自己真的在发的文件，要求它什么都不报：23 个 README 过 onboarding-check 零 error 零 warn、3 个 CHANGELOG 过 release-notes-check、20+ 个 LICENSE 过 license-check，以及真实的 120 条提交历史里没有任何一条因为"类型前缀"被 error 挡住（那是团队约定，不是 git 硬要求）。规则一旦开始对本项目自己写的东西报错，这组测试先红。它已经抓到一次：`dsh-review-outbox` 的 README 缺求助路径。

## 输出示例

真有失败时，报告里带着包名、规则名和行号，直接指到那一行：

```text
$ npm run check
ok   dsh-adr-check@0.1.0
ok   dsh-agreement-check@0.1.3
...
22 packages, 22 clean, 0 with gaps
```

每个包的 README 顶部还有一段「真实输入输出」：一份真的输入文件、它逐字跑出来的输出、以及出口码。那段例子由 `scripts/sync-readme-examples.mjs` 从 `scripts/checks-data.mjs` 注入，`npm test` 里有一条用例会重跑每个 CLI 并逐字比对，所以例子不会漂。

MIT.


## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

## 在 DSH 中安装（索引源）

全部八件作品都在一个 format 1 索引源里，从 npm registry 解析，装完即用：

1. 打开「插件」，启用实验性「自定义插件索引」。
2. 「发现 → 添加索引源」，添加：`https://zjukop3.github.io/dsh-review-outbox/plugins.json`
3. 按名字搜索安装。五个通用检查（`hashcheck` / `citelint` / `outline-lint` / `tablelint` / `numberlint`）在 [dsh-verify-kit](https://github.com/zjukop3/dsh-verify-kit)；本仓库的二十个场景检查见 [README 顶部表格](README.md) 或 [对照表](https://zjukop3.github.io/dsh-vertical-kit/compare/)。

不装 DSH 也可以：`npx <名字> --help` 直接用，或按下面的 CLI 说明。
