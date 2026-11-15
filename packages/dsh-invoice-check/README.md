# dsh-invoice-check

Invoice field checks for Chinese e-invoices: credit-code format, amount relationships (net + tax = total), uppercase/digit amount agreement, invoice number shapes.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
发票号码：24512000000123456789
统一社会信用代码：91330106MA27X8XXXX
购买方名称：甲科技有限公司
销售方名称：乙网络工作室
不含税金额（小写）：¥11,320.75
税额（小写）：¥679.25
价税合计（小写）：¥12,001.00
价税合计（大写）：壹万贰仟元整
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ invoice-check invoice-sample.txt
error amount-sum 第 5 行勾稽不平：不含税 11320.75 + 税额 679.25 = 12000，价税合计却是 12001（容差 0.02）
error amount-uppercase 大写金额 12000（第 8 行）与价税合计 12001（第 7 行）不一致
fail: 2 errors, 0 warnings
```

出口码：1。
<!-- example:start -->

An invoice is checkable without understanding the business: the credit code has a fixed alphabet, net plus tax should equal the total, and the uppercase amount should agree with the digits. This verifies exactly those, and labels everything else as not checked.

```bash
npx invoice-check invoice.txt --json
npx invoice-check invoice.txt --tolerance 0.02
```

Exit codes: `0` clean, `1` findings, `2` usage or read error. In DSH the same function is behind `POST /invoice-check/api` with `{"text":"…"}` or `{"path":"…"}`, so the panel and CI agree by construction.

Part of [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit): industry-scenario checks, each one verb, each runnable without DSH.

MIT.
