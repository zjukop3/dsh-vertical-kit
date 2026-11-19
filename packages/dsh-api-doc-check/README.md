# dsh-api-doc-check

API documentation hygiene from markdown. A doc is decidable: every endpoint carries a **method and a path**, there is at least one **example**, the **auth model** is stated once, and a **failure shape** is documented. This verifies exactly those.

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
# 接口说明

我们的接口在 /v1/items 上，可以用。
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ api-doc-check api-sample.md
error endpoints-missing 第0行 没有「METHOD + 路径」形式的端点（认得：GET /v1/items、POST /v1/orders），下限 1——只有路径没有动词的行不算，单独一行路径无法被调用
error examples-missing 第0行 代码块只有 0 个（下限 1）——接口文档至少要有一个请求或响应示例
error auth-missing 第0行 全文没有鉴权说明（认得：鉴权、认证、Authorization、API key、Bearer）——不知道怎么证明身份的接口文档不可用
warn error-shape-missing 第0行 没有错误响应的说明（认得：错误、失败、4xx、5xx）——只写成功的文档让读者猜失败长什么样
fail: 0 endpoints, 0 examples, 3 errors, 1 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `endpoints-missing` | error | no `METHOD /path` line (a bare path without a verb does not count — it cannot be called) |
| `examples-missing` | error | no fenced code block |
| `auth-missing` | error | no 鉴权/认证/Authorization/Bearer mention |
| `error-shape-missing` | warn | no 错误/失败/4xx/5xx mention — success-only docs leave the reader guessing |

## Use

```bash
npx api-doc-check api.md --json
npx api-doc-check api.md --min-endpoints 5
```

Same function over HTTP: `POST /api-doc-check/api` with `{"text": "…"}` or `{"path": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

This checks the doc's **bookkeeping**, not the API's correctness: it verifies the doc states method+path, shows a shape, names the auth model, and says what failure looks like. Whether the endpoint behaves that way is what the contract test is for.

Part of [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit): industry-scenario checks, each one verb, each runnable without DSH.

MIT.
