# dsh-meeting-notes-check

Meeting-note hygiene from markdown. A note is decidable: it must say **when** the meeting happened, **who** was in the room, **what was decided**, and every action item must carry **an owner and a deadline**. This verifies exactly those and names the line that is missing whom.

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

## Honest scope

This checks the note's **bookkeeping**, not the meeting's quality. It cannot tell whether 张三 really accepted the task or whether 下周三 was realistic — it verifies the note says who carries what by when. A meeting with genuinely no decisions passes with a warning, not a fake failure.
