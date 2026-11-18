# dsh-spec-doc-check

Spec-doc hygiene from markdown. A spec is decidable: it names the **problem**, states **acceptance criteria** a reader could actually check, and says what is **deliberately out of scope** — plus the rule that earns this package: a criterion written as a wish (`体验良好`, `速度合理`) can be neither accepted nor rejected.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# 导出重做

我觉得现在的导出体验不够好，想重做一下。

## 验收标准

- 体验良好
- 速度合理
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ spec-doc-check spec-sample.md
error problem-missing 第0行 没有背景/问题/目标段——读者不知道这个方案在解决什么
error out-of-scope-missing 第0行 没有「不做/范围外」段（认得：## 不做、## 非目标、Out of scope）——没写边界的方案在评审时会被无限扩大
error criteria-vague 第7行 第 7 行验收标准含「良好」但没有数字或可观测对象——「体验良好」既无法通过也无法拒绝
error criteria-vague 第8行 第 8 行验收标准含「合理」但没有数字或可观测对象——「速度合理」既无法通过也无法拒绝
fail: 2 criteria, 4 errors, 0 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `empty` | error | the document has no content |
| `problem-missing` | error | no 背景/问题/目标 section — the reader cannot tell what this solves |
| `criteria-missing` | error | no 验收标准 / Definition of Done section |
| `criteria-vague` | error | a criterion containing 良好/合理/友好/快速/… with no number, threshold, or named observable |
| `out-of-scope-missing` | error | no 不做/非目标/Out of scope section — a spec without edges expands at review |
| `criteria-thin` | warn | fewer criteria than the floor (default 2) |
| `open-questions-empty` | warn | a 待定/开放问题 heading with no items under it |

**The vague-word rule is not a word blacklist.** A criterion that contains 良好 *and* a threshold passes:

```
- 界面响应更快速，p95 从 800ms 降到 200ms      ← passes
- 体验合理，错误率不超过 0.5%                   ← passes
- 体验良好                                      ← error
```

What makes a criterion checkable is a number, a threshold, or a named observable (a status code, a field, a command). The rule only fires when the wish is all there is.

## Use

```bash
npx spec-doc-check spec.md --json
npx spec-doc-check spec.md --min-criteria 3
npx spec-doc-check - < spec.md
```

Same function over HTTP: `POST /spec-doc-check/api` with `{"text": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

This checks the spec's **shape**, not whether the plan is right: it cannot tell that the criteria are the wrong criteria, that the problem statement is a rationalisation, or that "out of scope" omits the hard part. It verifies the document states a problem, criteria someone could check afterwards, and a boundary — the three things a reviewer needs to disagree with it precisely. Whether the plan is good is what review and the eventual result are for.
