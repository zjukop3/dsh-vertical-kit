# dsh-citelint

A report cites the same source twice under two numbers, drops number 4 when a paragraph is deleted, or lists a source that no sentence ever uses. Each one is decidable from the markdown, so this checks it before a reviewer has to.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
## 结论

见 [1] 与 [3]。

[1]: https://example.com/a
[2]: https://example.com/b
[3]: ./missing-appendix.md
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ citelint report-cite.md
warn unreferenced [2] is defined and never cited in the text
error local-missing [3] points at ./missing-appendix.md, which is not in the delivered directory
fail: 1 errors, 1 warnings
```

出口码：1。
<!-- example:start -->

```bash
npx citelint report.md            # human output, exit 1 on findings
npx citelint report.md --json     # machine output for a pipeline
npx citelint report.md --warnings-fail
```

交付报告的引用检查：编号断号、同一来源重复编号、列了却没被引用的来源、指向不存在本地文件的链接。

Exit codes: `0` clean, `1` findings, `2` usage or read error. In DSH the same function is behind `POST /citelint/api` with `{"text":"…"}` or `{"path":"…"}`, so the panel and CI agree by construction.

Part of [dsh-verify-kit](https://github.com/zjukop3/dsh-verify-kit): five small deterministic checks, each one verb, each runnable without DSH.

## What it decides

引用的账目是否干净：编号断档、同一来源重复编号、列了却从未被引用的来源、失效的本地链接。每条发现带行号。

## Honest scope

这是引用的账目检查，不是来源核实：它证明**引用的账记得对**，不能证明被引的来源真的支持那句话——那要读原文。编号断档与孤儿来源是最常见的两种账目错误。

Part of [dsh-verify-kit](https://github.com/zjukop3/dsh-verify-kit): generic deliverable defects, each one verb, each runnable without DSH.

MIT.
