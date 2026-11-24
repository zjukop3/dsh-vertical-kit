# dsh-security-advisory-check

Security-advisory hygiene from markdown. An advisory is read by someone deciding two things in under a minute: **am I affected**, and **what do I do now**. This checks for the five facts that answer them — identifier, severity, affected range, fixed version, way out — plus the two that make it accountable: who to contact and when it was disclosed.

<!-- install:start -->
## 装进 DSH

```bash
dsh plugin --profile <profile> add dsh-security-advisory-check
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
# 备份导出接口存在越权问题

我们最近发现备份导出接口没有校验归属，任意登录用户可以导出他人的评审包。建议尽快升级。

```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ security-advisory-check advisory-sample.md
error id-missing 第0行 没有漏洞编号（认得：CVE-2026-12345、GHSA-xxxx-xxxx-xxxx、公告编号：…）——没有编号的公告无法被检索、被交叉引用
error severity-missing 第0行 没有严重程度（认得：严重程度：high、危险等级：高危、severity: medium）——散文里的「严重」不是等级，无法据此排期
error affected-missing 第0行 没有受影响版本范围（认得：受影响版本 <= 0.1.10、affected < 2.3.0、受影响范围：无）——「早期版本」「修复前」都不算范围，读者无法对照自己的版本
error fixed-missing 第0行 既没有修复版本，也没写「暂无可用修复」（认得：修复版本：0.1.11、fixed in 2.3.1、暂无可用修复）——读者分不清「没修」和「漏写」
warn disclosure-date-missing 第0行 没有披露日期（认得：披露日期：2026-11-18、disclosure date）——没有日期的公告无法判断是新的还是陈年的
fail: severity unstated, 4 errors, 1 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `title-missing` | error | no `# title` on the first line |
| `id-missing` | error | no CVE / GHSA / 公告编号：line |
| `severity-missing` | error | no stated level (严重程度：high)；「挺严重的」不是等级 |
| `affected-missing` | error | no version range (`<= 0.1.10`, `affected < 2.3.0`) and no explicit 「无」 |
| `fixed-missing` | error | neither a fixed version nor an explicit 「暂无可用修复」；「建议尽快升级」is not a version |
| `workaround-missing` | warn, **off by default** (`--check-workaround`) | no mitigation and no 「暂无可用缓解」 |
| `contact-missing` | warn, **off by default** (`--check-contact`) | no reporting channel or credit line |
| `disclosure-date-missing` | warn | no disclosure date |

## Use

```bash
npx dsh-security-advisory-check advisory.md --json
npx dsh-security-advisory-check advisory.md --check-workaround --check-contact
npx dsh-security-advisory-check advisory.md --warnings-fail
```

Same function over HTTP: `POST /security-advisory-check/api` with `{"text": "…"}` or `{"path": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

Measured against 20 real GHSA records: 7 pass with no findings, and the other 13 fire exactly one rule — `fixed-missing`. None of those 20 carried a `patched_versions` value, and 13 did not mention a fix in the text either. That number is the point of the rule: from the document alone a reader cannot tell "not fixed yet" from "the author forgot", and the fix is one sentence.

This checks whether the advisory **answers the reader's two questions**, not whether the vulnerability is real, whether the range is correct, or whether the severity was assigned honestly. A document can pass every rule here and still be wrong about who is affected — that is what a reproduction and a second pair of eyes are for. It also does not parse CVSS vectors or recompute scores.

Part of [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit): industry-scenario checks, each one verb, each runnable without DSH.

MIT.