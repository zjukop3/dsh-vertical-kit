# dsh-invoice-check

Invoice field checks for Chinese e-invoices: credit-code format, amount relationships (net + tax = total), uppercase/digit amount agreement, invoice number shapes.

An invoice is checkable without understanding the business: the credit code has a fixed alphabet, net plus tax should equal the total, and the uppercase amount should agree with the digits. This verifies exactly those, and labels everything else as not checked.

```bash
npx invoice-check invoice.txt --json
npx invoice-check invoice.txt --tolerance 0.02
```

Exit codes: `0` clean, `1` findings, `2` usage or read error. In DSH the same function is behind `POST /invoice-check/api` with `{"text":"…"}` or `{"path":"…"}`, so the panel and CI agree by construction.

Part of [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit): industry-scenario checks, each one verb, each runnable without DSH.

MIT.
