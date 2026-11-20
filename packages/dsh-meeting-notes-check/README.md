# dsh-meeting-notes-check

Meeting-note hygiene from markdown. A note is decidable: it must say **when** the meeting happened, **who** was in the room, **what was decided**, and every action item must carry **an owner and a deadline**. This verifies exactly those and names the line that is missing whom.

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# 项目周会

- 日期：2026-11-15
- 与会人：张三、李四、王五

## 议程

1. 讨论登录页改版
2. 评审导出性能

## 行动项

- [ ] 登录页模板替换
- [ ] 导出性能基线测试 负责人：李四
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ meeting-notes-check meeting-sample.md
error action-no-owner 第13行 第 13 行行动项没有负责人（认得：负责人：…、@名字、X 负责）：「- [ ] 登录页模板替换…」
error action-no-deadline 第13行 第 13 行行动项没有截止时间（认得：11月20日前、2026-11-20、下周三）
error action-no-deadline 第14行 第 14 行行动项没有截止时间（认得：11月20日前、2026-11-20、下周三）
warn decisions-missing 第0行 没有记录任何决定/决议/结论——如果这次会议真的没有决定，忽略这条
fail: 2 action items, 3 errors, 1 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `date-missing` | error | no recognizable date anywhere (2026-11-16, 11月16日, 11/16, 下周三) |
| `attendees-missing` | error | no 与会人/参会人/出席/Attendees line or heading |
| `action-no-owner` | error | a checkbox or 待办-numbered item without 负责人：… / @名字 / X 负责 |
| `action-no-deadline` | error | an action item without a date or a 周X deadline |
| `agenda-missing` | warn | no 议程/议题 heading or numbered discussion points |
| `decisions-missing` | warn | no 决定/决议/结论 — the message says to ignore it if the meeting truly made none |
| `no-action-items` | warn | no tasks at all — again with an escape hatch in the message |

Numbered lines are how a whole note is structured, so plain numbered discussion points are **not** action items; only checkboxes, and numbered lines under a 行动/待办/Action heading, count.

## Use

```bash
npx dsh-meeting-notes-check notes.md          # findings + summary, exit 1 on errors
npx dsh-meeting-notes-check notes.md --json   # machine output
npx dsh-meeting-notes-check notes.md --no-require-agenda
```

Same function over HTTP: `POST /meeting-notes-check/api` with `{"text": "…"}` or `{"path": "…"}`, optional `{"rules": {"requireAgenda": false}}` — the CLI and the host route share one implementation, so they cannot disagree.

## Measured against real meeting notes

Three TC39 meeting notes (`tc39/proposal-decorators/meetings/2018-07-31.md`, `2018-08-07.md`, `2019-01-15.md`) were run through this check. All three now produce **no errors**; each carries two warnings (`decisions-missing`, `no-action-items`) that are accurate for a transcript — TC39 call notes record discussion, not resolutions, and the messages say to ignore them when a meeting genuinely produced none. Before the measurement all three failed on `date-missing`: the rule knew Chinese and numeric dates but not `Tuesday, July 31, 2018`.

## Honest scope

This checks the note's **bookkeeping**, not the meeting's quality. It cannot tell whether 张三 really accepted the task or whether 下周三 was realistic — it verifies the note says who carries what by when. A meeting with genuinely no decisions passes with a warning, not a fake failure.
