# dsh-onboarding-check

Onboarding-doc hygiene from markdown. An onboarding doc is decidable: what must be **installed first**, a **pasteable command**, **what success looks like**, **where to ask when it fails** — and **how long it takes**, because a doc with no time estimate does not get started.

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# 上手

这个项目挺好用的，大家可以看看。
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ onboarding-check onb-sample.md
error prereq-missing 第0行 没有前置要求段（认得：## 前置要求、需要先装…、Prerequisites）——新人会卡在第 3 步才发现版本不对
error command-missing 第0行 没有可粘贴的命令代码块（认得：含 npm/pnpm/npx/pip/git clone/docker run 的 ``` 块）——没有命令的上手文档只能读，不能做
error success-missing 第0行 没有「成功长什么样」段（认得：## 你应该看到、## 输出示例、You should see）——没有预期输出的新人不知道自己是成功了还是静默失败了
warn help-missing 第0行 没有求助路径（认得：## 遇到问题、提 issue、ask in…）——失败时读者只有放弃这一个选项
warn time-estimate-missing 第0行 没有耗时估计（认得：约 5 分钟、15 分钟、under 10 minutes）——没写要花多久的文档不会被开始，读者无法判断值不值得现在做
fail: 0/0 blocks runnable, 3 errors, 2 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `empty` | error | the doc has no content |
| `prereq-missing` | error | no 前置要求/Prerequisites section — the reader discovers a version mismatch at step 3 |
| `command-missing` | error | no fenced block containing an install-ish command (`npm`/`pnpm`/`npx`/`pip`/`git clone`/`docker run`/…) — a doc you can only read is not onboarding |
| `success-missing` | error | no expected-output section — 「你应该看到」, 「## 输出示例」, `## Output`, `You should see` all count; without it the reader cannot tell success from silent failure |
| `help-missing` | warn | no 遇到问题 / issue link — when it fails the only option left is giving up |
| `time-estimate-missing` | warn | no duration anywhere (5 分钟 / under 10 minutes / 半小时) |

**The time rule is why this package exists.** A reader deciding whether to start right now needs to know it is fifteen minutes and not an afternoon. Docs that omit it get bookmarked and never opened — a failure with no error message.

Blocks are inspected by content: a ```` ```text ```` block showing version output is not a command block, and the check counts only the ones carrying an actual command.

## Use

```bash
npx onboarding-check README.md --json
npx onboarding-check - < ONBOARDING.md
```

Same function over HTTP: `POST /onboarding-check/api` with `{"text": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## The platform's own install command

`dsh plugin add <spec>` is how a plugin is installed here, and it was not in the command list — so a README whose one pasteable line was `dsh plugin add dsh-bot` was reported as having no command. 216 files across the ecosystem use that form. A tool for DSH that does not recognise `dsh` is measuring its own vocabulary.

Found by running this check over 39 READMEs from other plugin repositories, which is the only third-party corpus available here.

## A shell comment counts as the author speaking

The structural rules read prose, and fenced blocks are masked — but masking every fence threw away what real READMEs actually say. One third-party README states its success cue inside the install block:

    dsh plugin add dsh-todo-inbox
    # 重启 dsh web，侧边栏底部出现"待办"区块即成功

That comment is the author telling the reader what success looks like, and it was invisible. Masking is now narrow: only a block that quotes **this check's own output** (a level, a rule name, and `第N行`) is hidden. That keeps the self-reference guard — a README repeating this check's error text still cannot satisfy the rule — while letting the author speak inside their own code blocks.

Both defects came from the same corpus in one sitting, and the second was caused by the fix for an earlier one.

## What counts as prose

The structural rules — prerequisites, expected output, help path — are judged on the document's **prose only**. Fenced code blocks and table rows are masked out first.

This is not fussiness. A README that documents this check shows its output, and that output contains the sentence 「认得：## 前置条件、需要先…」. A rules table that says `no 前置条件 section` is one space away from being a prerequisites line. Before 0.2.0 both counted, so a README with no prerequisites section passed `prereq-missing` by quoting the rule that says it is missing — the check reading its own error message as the reader's prerequisites. Two of the twenty READMEs in this kit were passing that way. They are not passing now.

Command detection still reads the real text, because that one rule is about the code blocks.

## Honest scope

This checks the doc's **shape**, not whether the commands work: it cannot tell that the version in the prerequisite is wrong, that the install command needs sudo on this platform, or that the "you should see" output went stale two releases ago. It verifies the doc gives a reader prerequisites, something to paste, an expected result, a way to ask, and a time estimate. Whether following it actually works is what a fresh machine is for.
