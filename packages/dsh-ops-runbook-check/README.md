# dsh-ops-runbook-check

Ops runbook hygiene from markdown. A runbook is executable, and that makes it decidable: what you must have **before you start**, **numbered steps** you can follow under stress, a **rollback** path, and a way to **verify** it worked. Plus the rule that earns the package: **every destructive command carries a warning on the same line**.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# 发布手册

1. 停服务
2. rm -rf /data
3. 起服务
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ ops-runbook-check runbook-sample.md
error prereq-missing 第0行 没有前置条件段（认得：## 前置条件、需要先…、Prerequisites）——没有前置的手册让人在半路发现缺权限
error rollback-missing 第0行 没有回滚段（认得：## 回滚、回滚：…、Rollback）——出问题时读者没有退路
error verify-missing 第0行 没有验证段（认得：## 验证、确认：…、Verify）——没写怎么确认，读者不知道做完了没有
error destructive-unwarned 第4行 第 4 行含 rm -rf 但没有在同一行写明注意/备份/不可逆——这条命令在压力下会被照抄
warn shell-unspecified 第0行 没有说明用什么 shell（认得：bash、zsh、PowerShell）——同一条命令在不同 shell 里行为不同
fail: 3 steps, 4 errors, 1 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `prereq-missing` | error | no 前置条件 section — the reader discovers a missing permission halfway through |
| `steps-missing` | error | no numbered steps — prose cannot be followed under stress |
| `destructive-unwarned` | error | a destructive command in a numbered step with no 注意/备份/不可逆 on that line |
| `rollback-missing` | error | no 回滚 section — no way back when it goes wrong |
| `verify-missing` | error | no 验证 section — the reader cannot tell whether they finished |
| `steps-thin` | warn | fewer steps than the floor (default 3) |
| `shell-unspecified` | warn | the runbook never says which shell |

Destructive commands recognized (each has removed data for somebody): `rm -rf`, `DROP TABLE/DATABASE/SCHEMA`, `TRUNCATE TABLE`, `DELETE FROM`, `kubectl delete`, `terraform apply/destroy`, `git push --force`, `docker rm/rmi/system prune`, `mkfs`/`dd if=`.

The warning check looks **on the same line** deliberately: a warning three paragraphs above the command is not there when someone has copied one line into a terminal.

## Use

```bash
npx ops-runbook-check runbook.md --json
npx ops-runbook-check runbook.md --min-steps 5
```

Same function over HTTP: `POST /ops-runbook-check/api` with `{"text": "…"}` or `{"path": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

This checks the runbook's **shape**, not whether the steps are correct: it cannot tell you that step 3 is the wrong command, that the rollback path has itself been broken for a month, or that the verification passes for the wrong reason. It verifies the document gives a reader prerequisites, ordered steps, a way back, a way to confirm, and a warning where a command destroys something. Whether the procedure works is what a game day is for.
