# dsh-resume-check

Resume hygiene from markdown. A resume is decidable in its **bookkeeping**: the reader must be able to **reach the person**, the contact shapes must be **valid**, and the work timeline must **never overlap itself**. This verifies exactly those and names the line that is wrong.

<!-- install:start -->
## 装进 DSH

```bash
dsh plugin --profile <profile> add dsh-resume-check
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
# 李四

- 邮箱：lisi..wrong@site
- 电话：12345

## 工作经历

**A公司** 工程师 2020.1 - 2022.6
**B公司** 工程师 2021.5 - 2023.1
**C公司** 工程师 2022.3 - 至今
**D公司** 工程师 2023.2 - 2024.1
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ resume-check resume-sample.md
error email-invalid 第3行 第 3 行邮箱「lisi..wrong@site」不是合法形态（连续点或域缺尾）
error phone-invalid 第4行 第 4 行电话位数 5 不在 7-15 位之间
error dates-overlap 第9行 第 9 段经历（2021.5 - 2023.1）与上一段（2020.1 - 2022.6）时间重叠
error dates-overlap 第10行 第 10 段经历（2022.3 - 至今）与上一段（2021.5 - 2023.1）时间重叠
error dates-order 第11行 第 11 段（2023.2 - 2024.1）开始于「至今」的经历之后——如果是笔误请改成结束日期，如果确实是新经历请把上一段改为结束日期
warn education-missing 第0行 没有教育/学历信息（认得：## 教育背景、本科/硕士/博士、毕业院校）
fail: 4 stints, 5 errors, 1 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `contact-missing` | error | no 电话/手机/邮箱/微信/Email/Phone anywhere |
| `email-invalid` | error | an address that fails the strict shape (double dots, domain without a tail) — detection is loose, validation is strict, so a bad address is always caught |
| `phone-invalid` | error | digit count outside 7-15 |
| `dates-overlap` | error | two stints whose ranges overlap (2020.1-2022.6 then 2021.5-…) |
| `dates-order` | error | a closed stint starting **after** an open-ended one — a real contradiction, not a document-order nitpick |
| `date-gap` | warn | a >12-month gap between stints, only with `--no-allow-gaps` — a gap is informative, not a defect |
| `education-missing` | warn | no 教育/学历 section |

Date shapes parsed: `2020.3-2022.5`, `2020年3月-2022年5月`, `2020/3 ~ 2022/5`, `2020-03 至今`.

## Use

```bash
npx dsh-resume-check resume.md           # findings + summary, exit 1 on errors
npx dsh-resume-check resume.md --json    # machine output
npx dsh-resume-check resume.md --no-allow-gaps
```

Same function over HTTP: `POST /resume-check/api` with `{"text": "…"}` or `{"path": "…"}`, optional `{"rules": {"allowGaps": false}}` — the CLI and the host route share one implementation, so they cannot disagree.

## Measured against real documents named like a resume

Six public files named `resume.md` / `cv.md` were run through this check. Four are CVs and now pass clean; the other two are **work checkpoints** — "Session resume state — branch `codex/…`", "Resume Point", Russian `Дата / Ветка / Статус` — where contact details and education do not apply. They are now reported as a single `checkpoint-doc` warning instead of being judged as a CV with everything missing. The two CVs also produced two real fixes: an email address counts as contact without the words 邮箱/Email, and Chinese self-description education (「上大学就到了石家庄，研究生在北京读的」) counts as education.

One near-miss is worth recording: scoping the checkpoint marker to the first lines and headings was not cosmetic. Before that, a 37 KB CV that mentions a Checkpoint firewall in its experience section was one word away from being classified as a checkpoint.

## Honest scope

This checks the resume's **bookkeeping**, not its truth. It cannot tell whether the person actually worked at A公司 or whether the numbers in a bullet are real — it verifies the document is reachable, well-formed, and temporally coherent. Whether the content is honest is what an interview is for.
