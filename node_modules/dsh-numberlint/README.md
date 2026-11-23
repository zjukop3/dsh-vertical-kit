# dsh-numberlint

Comparing forms rather than values is the point: 4,985 and 4985 are the same number spelled two ways, and a reader who sees both stops trusting either.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
目录 4,985 个条目，我们实测了 4985 个。命中率 58.6%，另一处写 58.6 %。
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ numberlint report-numbers.md
warn thousands-inconsistent 4985 is written "4,985" and "4985" in the same document
warn percent-spacing 58.6% is written "58.6%" and "58.6 %"
ok: 0 errors, 2 warnings
```

出口码：0（警告不失败；--warnings-fail 时为 1）。
<!-- example:start -->

```bash
npx numberlint report.md            # human output, exit 1 on findings
npx numberlint report.md --json     # machine output for a pipeline
npx numberlint report.md --warnings-fail
```

同一文档内的数字写法一致性：同一个数量既写 4,985 又写 4985、同一百分比加了空格与没加空格、区间混用不同的连接号。

Exit codes: `0` clean, `1` findings, `2` usage or read error. In DSH the same function is behind `POST /numberlint/api` with `{"text":"…"}` or `{"path":"…"}`, so the panel and CI agree by construction.

Part of [dsh-verify-kit](https://github.com/zjukop3/dsh-verify-kit): five small deterministic checks, each one verb, each runnable without DSH.

## What it decides

同一数量在文档里是否只写一种形态：千分位有无、百分比空格、区间连接号——4,985 与 4985 混用会被点名。

## Honest scope

这是写法比较，不是算术验证：它抓**同一数量两种写法**，不能抓 4,985 这个数本身算错了。

Part of [dsh-verify-kit](https://github.com/zjukop3/dsh-verify-kit): generic deliverable defects, each one verb, each runnable without DSH.

MIT.
