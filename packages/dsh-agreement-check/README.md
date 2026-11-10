# dsh-agreement-check

Contract structure checks for Chinese agreements: parties, date, amount consistency (uppercase vs digits), signature blocks, dispute resolution, breach clauses.

A contract is unreviewable when a party is unnamed, no date anchors it, or the uppercase amount and the digits disagree. Those are decidable from the text, so this checks them before a lawyer has to. It is a checklist, not a lawyer: every finding is a missing structural element, never an opinion.

```bash
npx agreement-check contract.md --json
npx agreement-check contract.md --warnings-fail
```

Exit codes: `0` clean, `1` findings, `2` usage or read error. In DSH the same function is behind `POST /agreement-check/api` with `{"text":"…"}` or `{"path":"…"}`, so the panel and CI agree by construction.

Part of [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit): industry-scenario checks, each one verb, each runnable without DSH.

MIT.
