# dsh-document-check

One agent tool, 32 document checks. The model verifies a document it produced against
a genre's structural rules **before** delivering it, and gets findings with rule ids
and line numbers.

Installing 32 checks one at a time gives you 32 endpoints and no reason for an agent
to call any of them. This package registers a single tool, `document_check`, so the
step "check it before you hand it over" is something the model can decide to take.

## Why one tool and not 31

Twenty-seven tool definitions crowd the prompt, and in the first ten minutes a model
cannot tell `adr_check` from `spec_doc_check`. One tool with a `check` parameter keeps
the cost at one definition and puts the genre choice where the model already knows it:
in the document it just wrote.

## Requirements

- DSH `>=0.2.2-rc.1 <0.3.0-0` and Node `>=22.19.0`.
- No network, no model calls, no ports: the 32 checks are pure functions over text.

## Install

```
dsh plugin --profile <profile> add dsh-document-check
```

`--profile` is required by the CLI; use the profile you boot (`desktop` for the
Desktop app, `web` for `dsh web`). The tool appears in the agent's toolset on the next
session — confirming it before that only proves the package installed, not that the
tool registered.

## 它判定什么 / What it decides

Each of the 32 values calls one check's own rules. The tool adds no rules of its own: it
picks the linter, runs it on the text, and returns `ok`, two counts, and findings that
carry `level`, `rule`, `line` and `message`. Per-genre rule lists live in each check's
README — this package decides only which linter runs and how its findings are bounded.

## The 32 checks

Values of the `check` parameter: `adr-check`, `agreement-check`, `api-doc-check`,
`bug-report-check`, `citelint`, `commit-msg-check`, `contributing-check`,
`dockerfile-check`, `env-example-check`, `expense-claim-check`, `handover-check`,
`incident-report-check`, `invoice-check`, `license-check`, `listing-check`,
`meeting-notes-check`, `migration-guide-check`, `numberlint`, `onboarding-check`,
`ops-runbook-check`, `outline-lint`, `perf-report-check`, `pr-description-check`,
`privacy-notice-check`, `release-notes-check`, `resume-check`,
`security-advisory-check`, `spec-doc-check`, `tablelint`, `test-report-check`,
`weekly-report-check`, `plugin-entry-check`.

The CLI and `lintDocument()` are tolerant: `adr`, `ADR-check` and `dsh-adr-check` all
resolve to `adr-check`, because a human typing a command has no enum in front of them.

Whether the **tool** also tolerates a short form depends on the host: `defineTool` from
`@deepseek-ai/dsh-tools` 0.1.0-rc.6 validates arguments against the enum before
`execute` runs, so `document_check({check: 'adr'})` is refused there with the whole
list in the error; 0.2.2-rc.5 does not validate at that layer, so the call falls
through to the tolerant resolver. Measured 2026-11-23 on the Desktop host; the enum
still lists only exact values, which is what a model should copy from.

## Use it from the CLI

The agent and the CLI call the same function, so a document that passes in the panel
cannot fail on the command line:

```
npx dsh-document-check adr-check ./docs/adr-014.md
```

## 输出示例 / What you should see

Real output for an ADR that states neither a status nor a decision:

```text
error status-missing 第0行 没有状态（认得：状态：已接受、Status: accepted，或「## Status」下面一行）——不知道这条决策是否已生效。可取值：proposed/accepted/rejected/deprecated/superseded…
error decision-missing 第0行 没有决定段（认得：## 决定、## Decision）——ADR 的核心就是那一句「我们选了 X」
error consequences-missing 第0行 没有后果段（认得：## 后果、## Consequences）——决策的代价是后来人最需要读的一段
warn date-missing 第0行 没有日期（认得：2026-11-18）——决策的时间点决定了它的上下文
fail: adr-check 3 errors, 1 warnings
```

Exit codes: 0 clean, 1 errors, 2 usage. It takes well under 1 second: measured
2026-11-23, all 32 checks together take about 60 ms on a short document, the slowest being
`agreement-check` at 4.5 ms, and loading the tool costs 26 ms once per session. There
is nothing to wait for, which is the point — a check you have to schedule is a check
you skip.

## 一次调用的返回

What it returns to the model:

```
ok: false, 3 error(s), 1 warning(s)
error status-missing line 0: 没有状态（认得：状态：已接受、Status: Accepted、…）
```

At most 25 findings per call, plus an explicit note when more exist. A checker that
dumps two hundred findings into the context gets switched off, and the first 25 are
the ones worth fixing anyway.

## 诚实边界 / Honest scope

- **没有一次真实模型调用被记录下来。** 我验证了三件事：`apply()` 确实注册了工具（stub ctx 断言）、
  装好的包里 `execute()` 真的返回结论、工具与路由对同一份文档逐条相同（32 个检查）。
  但「模型在会话里自己决定调用它」这一步，在我这台机器上做不到：CLI 启动的 profile 拿不到
  桌面版那份凭证（`ZHANLU_CNH_API_KEY` 由 credentials service 持有，换 profile 就解析不到），
  而我不打算为了验证去改主人正在用的 profile。所以这一条现在是「没有反例」，不是「已验证」。

- Structural only. It says an ADR has a consequences section; it never says the
  consequence is acceptable.
- Genre mismatch is not detected. Checking a résumé with `invoice-check` is allowed
  and useless; the tool trusts the caller.
- `checkNumbering`-style multi-input checks are out of scope. `dsh-hashcheck` is not
  in the list at all: it hashes files, it does not read a document.
- The 32 values come from `src/checks.generated.js`, generated by
  `node scripts/sync-agent-tools.mjs` in the repository. Adding a check without
  re-running it leaves the tool listing 32 while the repository has 33 — the test
  suite fails on exactly that.

## Getting help

Open an issue at <https://github.com/zjukop3/dsh-vertical-kit/issues> with the check
name, the document that produced the finding, and the finding itself. A finding you
believe is wrong is a bug report about a rule, and each check's README names its rule
ids.

## License

MIT.