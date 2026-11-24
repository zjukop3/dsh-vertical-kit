# dsh-contributing-check

CONTRIBUTING-guide hygiene from markdown. A contributing guide is read by someone who has just decided to spend their evening on your project. Four things decide whether they finish — **a working dev setup, a test command that actually runs, what a pull request is expected to look like, and the style the code is held to** — and three decide whether they come back: where to ask, how commits should read, and whether a CLA or DCO will be sprung on them at review time.

The test command is the rule this package exists for. Every guide says "make sure the tests pass"; the ones that work say `pnpm test`. A guessed invocation is how a first PR arrives red.

<!-- install:start -->
## 装进 DSH

```bash
dsh plugin --profile <profile> add dsh-contributing-check
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
# Contributing

Thanks for your interest. Please be nice.

```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ contributing-check contributing-sample.md
error setup-missing 第0行 没有开发环境段（认得：## 开发环境、## Getting started、git clone / npm ci 这类命令）——新人卡在第一步就走了
error test-missing 第0行 没有测试段（认得：## 测试、## Running tests）——不知道该跑什么测试的人，交上来的 PR 是红的
error pr-missing 第0行 没有提交 PR 的说明（认得：## Pull request、## 贡献流程、## Submitting changes）——不知道你期待什么，第一次 PR 就会踩到你的隐性规矩
warn style-missing 第0行 没有代码风格段（认得：## 代码风格、## Lint，或明说提交时自动格式化）——风格要求藏在评审里，等于每次评审重讲一遍
warn questions-missing 第0行 没有「到哪问」的说明（认得：## 提问、Discord、mailing list、good first issue）——卡住的人只有放弃和硬猜两条路
warn commit-missing 第0行 没有提交信息约定（认得：Conventional Commits、Signed-off-by、DCO）——评审时才发现格式不对，返工的是对方
warn license-missing 第0行 没有许可/CLA/DCO 说明（认得：CLA、DCO、License）——贡献者不知道自己交出去的代码按什么授权
fail: 0 commands, 3 errors, 4 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `title-missing` | error | no `# title` and no RST underlined title |
| `setup-missing` | error | no dev-setup section and no `git clone` / `pnpm install` style command |
| `test-missing` | error | no test section and no runnable test command |
| `test-command-missing` | error | a test section with no command in it — 「请确保测试通过」 is not an instruction |
| `pr-missing` | error | no pull-request section |
| `style-missing` | warn (error with `--strict`) | no style section and no statement that formatting is automatic |
| `questions-missing` | warn (error with `--strict`) | no "where to ask" |
| `commit-missing` | warn (error with `--strict`) | no commit convention (Conventional Commits, DCO) |
| `license-missing` | warn (error with `--strict`) | no license / CLA / DCO statement |
| `pointer-guide` | warn | the file delegates: no command of its own, but it names a target document |

## Use

```bash
npx dsh-contributing-check CONTRIBUTING.md --json
npx dsh-contributing-check CONTRIBUTING.md --strict --warnings-fail
```

Same function over HTTP: `POST /contributing-check/api` with `{"text": "…"}` or `{"path": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Measured against real guides

Five public guides were run through this check: `nodejs/node`, `vitejs/vite`, `rust-lang/rust`, `kubernetes/kubernetes`, `django/django` (RST). One passes clean; the other four are **pointer guides** — files whose whole content is "the real guide lives over there". For those the check returns a single `pointer-guide` warning naming the target instead of seven section findings, because a pointer cannot be read section by section.

Three things came out of the measurement and are pinned by tests: a command inside backticks mid-sentence counts (`Run \`pnpm i\` in the root folder`), an explicit "no need to worry about style, it formats on commit" counts as the style answer, and an RST underlined title counts as a title.

## Honest scope

This checks whether the guide **tells a stranger what to do**, not whether the commands work. A guide can pass every rule here and still fail a newcomer, because the setup steps are wrong or the test suite is broken — running the steps is what catches that. It also cannot judge whether the project is friendly, which is what actually decides whether someone comes back.

Part of [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit): industry-scenario checks, each one verb, each runnable without DSH.

MIT.