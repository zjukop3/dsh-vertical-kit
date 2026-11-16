# dsh-resume-check

Resume hygiene from markdown. A resume is decidable in its **bookkeeping**: the reader must be able to **reach the person**, the contact shapes must be **valid**, and the work timeline must **never overlap itself**. This verifies exactly those and names the line that is wrong.

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

## Honest scope

This checks the resume's **bookkeeping**, not its truth. It cannot tell whether the person actually worked at A公司 or whether the numbers in a bullet are real — it verifies the document is reachable, well-formed, and temporally coherent. Whether the content is honest is what an interview is for.
