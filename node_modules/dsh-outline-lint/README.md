# dsh-outline-lint

Length is not the failure mode; shape is. This reports the five defects that make a document unreviewable regardless of how good the reasoning is.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# 数据管线报告

#### 处理流程

原始数据经清洗后入库。
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ outline-lint report-outline.md
warn heading-jump line 3: "处理流程" is h4 directly under h1, which reads as a lost level
error no-conclusion no conclusion before the body: add a heading matching 结论/摘要 or open the first paragraph with 结论：
error no-reproduction nothing a reader can run: add a 复现 section or a fenced command
fail: 2 errors, 1 warnings
```

出口码：1。
<!-- example:start -->

```bash
npx outline-lint report.md            # human output, exit 1 on findings
npx outline-lint report.md --json     # machine output for a pipeline
npx outline-lint report.md --warnings-fail
```

交付文档结构检查：缺标题、多个一级标题、标题跳级、开头没有结论、没有任何可复现命令。

**范围**：结论规则（no-conclusion）针对**报告类交付物**——研究报告、评审报告这类有「交代结论」义务的文档。参考文档（README、手册、 CHANGELOG）没有结论义务，对这些文件出现的 no-conclusion 是域外提示，不是缺陷。

Exit codes: `0` clean, `1` findings, `2` usage or read error. In DSH the same function is behind `POST /outline-lint/api` with `{"text":"…"}` or `{"path":"…"}`, so the panel and CI agree by construction.

Part of [dsh-verify-kit](https://github.com/zjukop3/dsh-verify-kit): five small deterministic checks, each one verb, each runnable without DSH.

## What it decides

交付文档的结构是否可审：标题在场、结论在前、有可运行的东西、标题层级不跳级。结论规则针对报告类交付物；参考手册类文档不在域内（0.1.3 起按领域判定）。

## A heading with its text deleted

`##` alone on a line is not a heading as far as a Markdown parser is concerned, and this check used to agree — so `empty-heading`, the rule that exists for exactly that case, could never fire. The heading regex now accepts an empty title and reports it.

Found by `scripts/audit-rules.mjs`, which requires every rule to be observed in both directions. It reported `empty-heading` as silent-only, and the test written to prove it fires proved the opposite.

## Honest scope

这是结构检查，不是结论核实：它说文档**结构上可审**，从不说结论**是对的**。结论在前是对报告类的结构约定，不是对散文的审美。

Part of [dsh-verify-kit](https://github.com/zjukop3/dsh-verify-kit): generic deliverable defects, each one verb, each runnable without DSH.

MIT.
