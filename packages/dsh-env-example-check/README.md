# dsh-env-example-check

Env-example hygiene from one file. A committed `.env.example` is the contract every new contributor reads first, and it is decidable: every key carries a **placeholder**, no **live credential** shipped with it, no **duplicate key** silently overriding an earlier one, and the file **says what each key is for**.

<!-- install:start -->
## 装进 DSH

```bash
dsh plugin --profile <profile> add dsh-env-example-check
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
npx dsh-env-example-check .env.example --json
npx dsh-env-example-check .env.example --require-comment
```

Same function over HTTP: `POST /env-example-check/api` with `{"text": "…"}` or `{"path": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## A documented example URL is a placeholder

Reserved example domains and loopback hosts count as placeholders: `example.com`, `example.org`, `example.edu`, `*.test`, `*.invalid`, `localhost`, `127.0.0.1`. A documentation URL pointing at `https://remote.example.edu/...` is as much a placeholder as `<your-host>`.

Found on a real third-party `.env.example`: its only crime was documenting a URL on a reserved example domain, and this check called it a committed literal. A rule that flags correct documentation is a rule that gets the whole file deleted from CI rather than fixed.

## Honest scope

This checks the example file's **shape**, not whether the real `.env` leaked: it cannot see your repository history, your CI secrets, or whether the placeholder is filled correctly. Run it in a pre-commit hook and in CI on the example file — it catches the copy-paste that ships a credential, which is the failure it exists for.
