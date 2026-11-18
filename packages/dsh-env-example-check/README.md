# dsh-env-example-check

Env-example hygiene from one file. A committed `.env.example` is the contract every new contributor reads first, and it is decidable: every key carries a **placeholder**, no **live credential** shipped with it, no **duplicate key** silently overriding an earlier one, and the file **says what each key is for**.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
DATABASE_URL=postgres://user:pass@prod-db:5432/app
PORT=8080
API_KEY=sk-live-abc123
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ env-example-check env-sample
error literal-value 第1行 第 1 行 DATABASE_URL 带了字面值「postgres://user:pass」——示例文件只放占位符，真值进 .env（不提交）
error literal-value 第2行 第 2 行 PORT 带了字面值「8080」——示例文件只放占位符，真值进 .env（不提交）
error literal-value 第3行 第 3 行 API_KEY 带了字面值「sk-live-abc123」——示例文件只放占位符，真值进 .env（不提交）
warn comment-missing 第0行 没有任何注释行——说明每个键的用途，读者才知道该填什么
fail: 3 keys, 3 errors, 1 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `empty` | error | no `KEY=value` line at all |
| `literal-value` | error | a key carries a real-looking value — the file was copied from `.env` |
| `duplicate-key` | error | the same key twice; the later assignment wins silently, named with both lines |
| `line-unparsed` | warn | a line that is not `KEY=value` and not a comment |
| `key-case` | warn | a lowercase key — in a shell, `port` and `PORT` are two variables |
| `comment-missing` | warn | no comment line at all (an error with `--require-comment`) |

Accepted placeholders: empty, `<angle-bracketed>`, `${VAR}` references, `your-…`, `changeme`, `xxx`, `TODO`, `placeholder`, `example`, `dummy`, `test`, `none`, `null`. Anything else is a literal that shipped.

## Use

```bash
npx env-example-check .env.example --json
npx env-example-check .env.example --require-comment
```

Same function over HTTP: `POST /env-example-check/api` with `{"text": "…"}` or `{"path": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

This checks the example file's **shape**, not whether the real `.env` leaked: it cannot see your repository history, your CI secrets, or whether the placeholder is filled correctly. Run it in a pre-commit hook and in CI on the example file — it catches the copy-paste that ships a credential, which is the failure it exists for.
