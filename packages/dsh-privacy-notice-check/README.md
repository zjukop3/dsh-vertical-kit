# dsh-privacy-notice-check

Privacy-notice hygiene from markdown. Five questions have to be answerable from the text — **what is collected, what it is used for, how long it is kept, who else sees it, who to ask** — plus two that make it usable: the effective date and the rights a reader can exercise.

Retention is the rule this package exists for. Almost every notice says what it collects and why, then goes quiet about how long — which is the exact question that decides whether "delete my account" means anything.

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# 隐私声明

我们很重视你的隐私，会尽力保护你的信息。

```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ privacy-notice-check privacy-sample.md
error data-missing 第0行 没有说明收集什么（认得：## 我们收集的信息、收集的信息：…，或不收集）——这是读者第一个要问的
error purpose-missing 第0行 没有说明用途（认得：## 使用目的、用途：…、## How we use it）——「为了提供服务」和「什么都能干」是两种声明
error retention-missing 第0行 没有保留期限（认得：## 保留期限、保留时间：30 天，或不保留）——没有期限，「注销账号」就不等于数据会消失
error sharing-missing 第0行 没有第三方共享说明（认得：## 共享、## 第三方、共享：…）——散文里提到「第三方」不算声明，读者指不出哪一句是承诺
error contact-missing 第0行 没有联系方式（认得：## 联系我们、联系邮箱：…、privacy@example.com）——没有渠道，行使权利就是空话
warn effective-date-missing 第0行 没有生效或更新日期（认得：生效日期：2026-11-01、last updated）——不知道版本的声明，无法判断哪一版约束我
warn rights-missing 第0行 没有用户权利说明（认得：## 你的权利、你有权访问/删除…、Your rights）——只说收集不说权利，读者只能猜自己能要求什么
fail: 5 errors, 2 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `title-missing` | error | no `# title` on the first line |
| `data-missing` | error | no statement of what is collected；「不收集任何数据」也是答案 |
| `purpose-missing` | error | no stated purpose section or labelled line |
| `retention-missing` | error | no retention period；「不保留」也是答案 |
| `sharing-missing` | error | no sharing / third-party section；散文里提到「第三方」不算声明 |
| `contact-missing` | error | no contact section, labelled line, or email address |
| `effective-date-missing` | warn | no effective or last-updated date |
| `rights-missing` | warn (error with `--require-rights`) | no rights statement (## 你的权利、你有权访问/删除…) |

## Use

```bash
npx privacy-notice-check notice.md --json
npx privacy-notice-check notice.md --require-rights --warnings-fail
```

Same function over HTTP: `POST /privacy-notice-check/api` with `{"text": "…"}` or `{"path": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

This checks that the notice **answers the questions**, not that the answers are lawful in any particular jurisdiction. It does not know GDPR from PIPL, does not check whether the stated retention matches what the code actually does, and cannot tell whether a "we do not share" claim is true. A notice collects nothing and says so passes the data and retention rules by design: a negative claim is content, and demanding a section on top of it would teach authors to write filler.

Part of [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit): industry-scenario checks, each one verb, each runnable without DSH.

MIT.