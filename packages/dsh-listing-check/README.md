# dsh-listing-check

E-commerce listing hygiene from CSV/JSON exports: title length bounds, keyword stuffing, price validity and bounds, SKU completeness and duplicates.

A listing is decidable from the export: title length bounds, repeated keywords, price validity, SKU completeness. This verifies exactly those, with configurable bounds, and says which row failed.

```bash
npx listing-check listings.csv --json
npx listing-check listings.csv --min-title 10 --max-title 60 --max-price 9999
```

Exit codes: `0` clean, `1` findings, `2` usage or read error. In DSH the same function is behind `POST /listing-check/api` with `{"text":"…"}` or `{"path":"…"}`, so the panel and CI agree by construction.

Part of [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit): industry-scenario checks, each one verb, each runnable without DSH.

MIT.
