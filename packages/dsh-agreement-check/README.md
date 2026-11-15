# dsh-agreement-check

Contract structure checks for Chinese agreements: parties, date, amount consistency (uppercase vs digits), signature blocks, dispute resolution, breach clauses.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
甲方：甲科技有限公司
乙方：乙网络工作室

本合同总金额为人民币壹万贰仟元整（¥13,000元）。

甲方（盖章）
乙方（盖章）
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ agreement-check contract-sample.md
error date 全文没有任何日期，合同无法锚定生效时间
error amount-mismatch 大写金额 12000（第 4 行）与所有数字金额（13000@4）都对不上
error dispute 没有争议解决条款（仲裁/诉讼/管辖）
error breach 没有违约责任条款
warn term 没有期限条款（合同期限/有效期/履行期限）
fail: 4 errors, 1 warnings
```

出口码：1。
<!-- example:start -->

A contract is unreviewable when a party is unnamed, no date anchors it, or the uppercase amount and the digits disagree. Those are decidable from the text, so this checks them before a lawyer has to. It is a checklist, not a lawyer: every finding is a missing structural element, never an opinion.

```bash
npx agreement-check contract.md --json
npx agreement-check contract.md --warnings-fail
```

Exit codes: `0` clean, `1` findings, `2` usage or read error. In DSH the same function is behind `POST /agreement-check/api` with `{"text":"…"}` or `{"path":"…"}`, so the panel and CI agree by construction.

Part of [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit): industry-scenario checks, each one verb, each runnable without DSH.

MIT.
