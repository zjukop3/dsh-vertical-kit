# dsh-vertical-kit

Industry-scenario checks for deliverables an agent produced and a person is about to accept. The generic defects (ragged tables, broken citations) live in [dsh-verify-kit](https://github.com/zjukop3/dsh-verify-kit); this kit covers the vocabulary of specific trades.

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) — catalog pages: [dsh-agreement-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-agreement-check/) · [dsh-invoice-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-invoice-check/) · [dsh-listing-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-listing-check/) · [dsh-meeting-notes-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-meeting-notes-check/) · [dsh-resume-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-resume-check/) · [dsh-release-notes-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-release-notes-check/) · [dsh-weekly-report-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-weekly-report-check/) · [dsh-bug-report-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-bug-report-check/) · [dsh-api-doc-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-api-doc-check/) · [dsh-test-report-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-test-report-check/) · [dsh-commit-msg-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-commit-msg-check/) · [dsh-dockerfile-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-dockerfile-check/) · [dsh-env-example-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-env-example-check/) · [dsh-license-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-license-check/) · [dsh-incident-report-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-incident-report-check/) · [dsh-ops-runbook-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-ops-runbook-check/) · [dsh-pr-description-check](https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-pr-description-check/).

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
| [dsh-commit-msg-check](packages/dsh-commit-msg-check) | engineering | type prefix, subject length, no trailing period, blank line, breaking trailer |
| [dsh-dockerfile-check](packages/dsh-dockerfile-check) | engineering / ops | pinned base, non-root USER, no secrets in layers, COPY over ADD, package cleanup |
| [dsh-env-example-check](packages/dsh-env-example-check) | engineering / ops | placeholders only, no committed credential, no duplicate key, purpose comments |
| [dsh-license-check](packages/dsh-license-check) | legal / open source | recognized body, title matches body, copyright holder and year, no leftover template |
| [dsh-incident-report-check](packages/dsh-incident-report-check) | SRE / ops | timestamped timeline, impact and duration, root cause not remedy, owned follow-ups |
| [dsh-ops-runbook-check](packages/dsh-ops-runbook-check) | SRE / ops | prerequisites, numbered steps, rollback, verification, warning beside every destructive command |
| [dsh-pr-description-check](packages/dsh-pr-description-check) | engineering | what / why / how-verified, linked issue, breaking change with migration, no unchecked checklist |

Design rules, unchanged from verify-kit:

- **A check must be decidable from the file.** No model calls. A rule that needs judgment is not a rule; this kit states comparisons and reports the row and line that failed.
- **A finding names its row.** "第 3 行甲方名称为空" is actionable; "party information may be incomplete" is not.
- **These are checklists, not professionals.** dsh-agreement-check says a contract is structurally reviewable; it never says it is a good contract. dsh-invoice-check verifies arithmetic; it never verifies a business.
- **The route and the CLI call the same function**, so a check that passes in CI cannot fail in the panel.

```bash
npm test   # 18 tests, no network
```

MIT.


## 在 DSH 中安装（索引源）

全部八件作品都在一个 format 1 索引源里，从 npm registry 解析，装完即用：

1. 打开「插件」，启用实验性「自定义插件索引」。
2. 「发现 → 添加索引源」，添加：`https://zjukop3.github.io/dsh-review-outbox/plugins.json`
3. 按名字搜索安装（本仓库的五个：`hashcheck` / `citelint` / `outline-lint` / `tablelint` / `numberlint`；行业三件在 [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit)：`agreement-check` / `invoice-check` / `listing-check`）。

不装 DSH 也可以：`npx <名字> --help` 直接用，或按下面的 CLI 说明。
