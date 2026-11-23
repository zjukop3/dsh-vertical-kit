# dsh-tablelint

A ragged table renders correctly in the editor that produced it and broken everywhere it is published. Cell counts are cheap to compare and expensive to notice by eye.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
| 项目 | 数量 |
| --- | --- |
| 一 | 2 |
| 三 | 4 | 6 |
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ tablelint report-table.md
error column-count line 4: 3 cells in a 2-column table
fail: 1 errors, 0 warnings
```

出口码：1。
<!-- example:start -->

```bash
npx tablelint report.md            # human output, exit 1 on findings
npx tablelint report.md --json     # machine output for a pipeline
npx tablelint report.md --warnings-fail
```

生成报告的 Markdown 表格检查：行内单元格数与表头不一致、分隔行与表头数量不符、表头重名或为空、只有表头没有数据行。

Exit codes: `0` clean, `1` findings, `2` usage or read error. In DSH the same function is behind `POST /tablelint/api` with `{"text":"…"}` or `{"path":"…"}`, so the panel and CI agree by construction.

Part of [dsh-verify-kit](https://github.com/zjukop3/dsh-verify-kit): five small deterministic checks, each one verb, each runnable without DSH.

## What it decides

Markdown 表格的形状是否完整：错位行、分隔行与表头列数不符、重复表头、空表。每条发现带行号。

## Honest scope

这是表格形状检查，不是数值核对：它证明**表格渲染不会塌**，不能证明表里的数与正文一致——那是 numberlint 的邻居。

Part of [dsh-verify-kit](https://github.com/zjukop3/dsh-verify-kit): generic deliverable defects, each one verb, each runnable without DSH.

MIT.
