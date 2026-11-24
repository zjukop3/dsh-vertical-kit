# dsh-spec-doc-check

Spec-doc hygiene from markdown. A spec is decidable: it names the **problem**, states **acceptance criteria** a reader could actually check, and says what is **deliberately out of scope** — plus the rule that earns this package: a criterion written as a wish (`体验良好`, `速度合理`) can be neither accepted nor rejected.

<!-- install:start -->
## 装进 DSH

```bash
dsh plugin --profile <profile> add dsh-spec-doc-check
```

`--profile` 是 `dsh plugin` 的必填项（Desktop 用 `desktop`，Web 用 `web`）。装完在「插件」里启用，对话中就有这条检查的 host 路由；不装 DSH 也能用上面的 `npx`。
<!-- install:end -->

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

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

## 四种体裁

「规格」不是一种文档，是四种。规则按体裁走，不按关键词走：

1. **提案型规格**（要解决的问题 + 验收标准 + 范围外）：`problem-missing`、`criteria-missing`、`criteria-vague`、`out-of-scope-missing`。这是这个包最早只认的一种。
2. **参考文档**（一个子系统一页：它是什么、搬哪些数据结构、公开哪些服务）：`summary-missing`（标题后要有一句定义）、`source-missing`（要指向它描述的实现）、`surface-missing`（要写出公开面的标识符）。DSH 自带的 47 份 `subsystems/` 就是这种——对它问「验收标准」等于问说明书。
3. **生成的图页**（一段 mermaid + 一句说明）：只要求有标题。
4. **索引页**（一张表，每行指向一页）：只说一句 `pointer-guide`，别的规则一律不适用。

体裁由结构判：`Source:` 行、`## Service/Events/API` 节、或高密度代码标识符 ⇒ 参考文档；出现验收标准或范围外节 ⇒ 提案；有 mermaid ⇒ 图页；十个以上链接且几乎没有标识符 ⇒ 索引页。

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
npx dsh-spec-doc-check spec.md --json
npx dsh-spec-doc-check spec.md --min-criteria 3
npx dsh-spec-doc-check - < spec.md
```

Same function over HTTP: `POST /spec-doc-check/api` with `{"text": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Measured against real specs

Three Kubernetes KEPs (`135-seccomp`, `127-user-namespaces`, `1547-building-kubelet-without-docker`) were run through this check. All three now pass with no errors; one is clean and two warn `criteria-thin`, which is accurate — their acceptance criteria are prose paragraphs under `### Test Plan` rather than an enumerable list. Before the measurement all three failed with `criteria-missing`, because the rule only knew "acceptance criteria" and not the two headings the whole KEP process uses.

## Honest scope

This checks the spec's **shape**, not whether the plan is right: it cannot tell that the criteria are the wrong criteria, that the problem statement is a rationalisation, or that "out of scope" omits the hard part. It verifies the document states a problem, criteria someone could check afterwards, and a boundary — the three things a reviewer needs to disagree with it precisely. Whether the plan is good is what review and the eventual result are for.
