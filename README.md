# dsh-vertical-kit

Industry-scenario checks for deliverables an agent produced and a person is about to accept. The generic defects (ragged tables, broken citations) live in [dsh-verify-kit](https://github.com/zjukop3/dsh-verify-kit); this kit covers the vocabulary of specific trades.

| package | trade | what it decides |
| --- | --- | --- |
| [dsh-agreement-check](packages/dsh-agreement-check) | legal / procurement | parties named, date present, uppercase amount matches the digits, signature block, dispute and breach clauses |
| [dsh-invoice-check](packages/dsh-invoice-check) | finance | credit-code alphabet, net + tax = total, uppercase vs printed total, invoice-number shapes |
| [dsh-listing-check](packages/dsh-listing-check) | e-commerce ops | title bounds, keyword repetition, price validity, SKU completeness and duplicates |

Design rules, unchanged from verify-kit:

- **A check must be decidable from the file.** No model calls. A rule that needs judgment is not a rule; this kit states comparisons and reports the row and line that failed.
- **A finding names its row.** "第 3 行甲方名称为空" is actionable; "party information may be incomplete" is not.
- **These are checklists, not professionals.** dsh-agreement-check says a contract is structurally reviewable; it never says it is a good contract. dsh-invoice-check verifies arithmetic; it never verifies a business.
- **The route and the CLI call the same function**, so a check that passes in CI cannot fail in the panel.

```bash
npm test   # 18 tests, no network
```

MIT.
