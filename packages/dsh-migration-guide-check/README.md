# dsh-migration-guide-check

Migration-guide hygiene from markdown. A guide is read mid-upgrade, by someone who has already started and cannot ask anyone. This checks the three things that decide whether they finish — the **version span**, the **breaking changes as a list**, and the **numbered steps** — plus verification, rollback, and the backup prompt that decide whether they recover.

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# 升级说明

我们改了参数名，升级后注意一下。

```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ migration-guide-check migration-sample.md
error from-to-missing 第0行 没有版本跨度（认得：从 0.1.0 到 0.2.0、0.1.7 → 0.2.0、from v1 to v2）——「升级到 0.2.0」是发布说明，不是迁移指南
error breaking-missing 第0行 没有可逐条对照的变更清单（认得：## 破坏性变更、## Breaking changes，或至少三节讲变更的小节）——散文里提一句「这次不兼容」不是清单
warn steps-missing 第0行 没有编号步骤（认得：1. … 2. …）——有步骤的指南能照着做，没有的只能照着读
fail: span unstated, 0 steps, 2 errors, 1 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `title-missing` | error | no `# title` and no frontmatter `title:` |
| `from-to-missing` | error | no version span (从 0.1.0 到 0.2.0、0.1.7 → 0.2.0、from v1 to v2) **and** no migration target in the title (「Migrating to v5」)；a bare version with no migration word is neither |
| `breaking-missing` | error | no breaking-changes section, no labelled list, and fewer than three sections that read as changes (Removed…, Renamed…, Now uses…)；散文里提一句「不兼容」不算清单 |
| `steps-missing` | warn (error with `--require-steps`) | no numbered steps；散文里的「先备份再升级」不是步骤 |
| `steps-thin` | warn | fewer steps than the floor (default 3) |
| `verify-missing` | warn, **procedural guides only** | no way to confirm the upgrade worked |
| `rollback-missing` | warn (error with `--require-rollback`), **procedural guides only** | no rollback path |
| `backup-missing` | warn, **procedural guides only** | no backup prompt before the change |

## Use

```bash
npx dsh-migration-guide-check guide.md --json
npx dsh-migration-guide-check guide.md --min-steps 5 --require-steps --require-rollback
npx dsh-migration-guide-check guide.md --check-recovery   # 全指南都问验证/回滚/备份
```

Same function over HTTP: `POST /migration-guide-check/api` with `{"text": "…"}` or `{"path": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

This checks the guide's **shape**, not its correctness: whether it names the jump it covers, enumerates what breaks, gives steps in order, and tells the reader how to confirm and undo. Steps that are wrong, or a span that misses a version, cannot be detected from the text — running the migration in a scratch profile is what catches those. Bullet lists do not count as steps on purpose: order matters in a migration, and a `-` list does not promise any.

Measured against two real guides — Vite's `docs/guide/migration.md` and TanStack Query's "Migrating to v5": both pass with no errors and one warning (`steps-missing`). Neither is a procedure, so the recovery questions stay quiet; that gating came straight out of the measurement, because without it all three fired on 100% of real guides.

Part of [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit): industry-scenario checks, each one verb, each runnable without DSH.

MIT.