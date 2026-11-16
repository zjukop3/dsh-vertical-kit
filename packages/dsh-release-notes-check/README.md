# dsh-release-notes-check

Release-note hygiene from markdown. A changelog is decidable in its **bookkeeping**: it must say **which version**, **when**, pair every **breaking change** with an **upgrade path**, and list versions **newest first** — the one convention every changelog reader relies on. This verifies exactly those.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# Changelog

## 2.1.0 — 2026-11-17

### Breaking

- 配置文件键「endpoint」改名「server」

## 1.9.0 — 2026-10-01

- 修了几个问题
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ release-notes-check release-sample.md
error breaking-without-upgrade 第0行 声明了破坏性变更但没有升级/迁移说明——读者被留在原地
warn upgrade-missing 第0行 没有升级/迁移说明（认得：## 升级、## 迁移、upgrade guide）——如果这次没有破坏性变更，忽略这条
fail: 2 version headings, 1 errors, 1 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `version-missing` | error | no version heading (## 1.2.0 / ## v1.2.0) or 版本： line |
| `date-missing` | error | no full date anywhere (2026-11-17) |
| `order` | error | a newer version heading appears after an older one |
| `breaking-without-upgrade` | error | a breaking change claimed with no upgrade/migration section — the reader is stranded |
| `upgrade-missing` | warn | no upgrade path at all — the message says to ignore it if nothing broke |

## Use

```bash
npx release-notes-check notes.md --json
npx release-notes-check notes.md --no-require-upgrade
```

Same function over HTTP: `POST /release-notes-check/api` with `{"text": "…"}` or `{"path": "…"}`, optional `{"rules": {"requireUpgrade": false}}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

This checks the changelog's **bookkeeping**, not the software's quality: it verifies the note says which version, when, what breaks, and how to migrate. Whether the release is good is what the software is for. The ordering rule reads heading order, so a changelog that lists versions out of order on purpose (e.g. a "highlights first" page) is out of this rule's domain.
