# 装一遍、调一遍：2026-11-23 的端到端验证

这份记录只写真的跑出来的东西，包括跑出来的坏消息。

## 环境

- DSH CLI `0.2.2-rc.5`（Desktop 包内），profile 从 `web` 模板新建，名为 `probe-web`。
- `dsh plugin --profile probe-web add dsh-check-suite`，先走默认 registry（npmmirror），
  后改 `--registry=https://registry.npmjs.org`。
- 端口 `3099`，只绑 `127.0.0.1`。

## 第一轮：装不上（0.1.0）

```
ERR_PNPM_TARBALL_EXTRACT  Failed to add tarball from
"https://registry.npmmirror.com/dsh-check-suite/-/dsh-check-suite-0.0.0-stage.tgz"
to store: Invalid checksum for TAR header at offset 2560.
```

npmmirror 的 `dist-tags.latest` 停在名字首发时那个占位版本上（`0.0.0-stage`，2 个文件、
337 字节），而 npmjs 上 latest 是 `0.1.0`。触发镜像重新抓取：

```bash
curl -X PUT https://registry.npmmirror.com/dsh-check-suite/sync   # 201 {"ok":true,"logId":…}
```

约 6 分钟后镜像跟上，同一条命令成功：`resolved 28, downloaded 28, done in 7.1s`。

## 第二轮：装上了，端点坏了（0.1.0）

```
POST /adr-check/api      {"path": "/tmp/adr.md"}  → 400 {"error":"text.split is not a function"}
POST /commit-msg-check/api {"path": "/tmp/cm.txt"} → 200 … "subject": 16 … "type-missing"
POST /perf-report-check/api                       → 400 {"error":"lintLoadtestReport is not defined"}
```

- 前两条是同一个缺陷：`(await import('node:fs/promises')).readFile(…)` 少了最外面的
  `await`，`text` 是 Promise。24 个包相同。
- commit-msg 那条更隐蔽：它没崩，把 `String(promise)` 当正文，`"[object Promise]"`
  正好 16 个字符，于是对任何 `path` 请求都给出一条 `type-missing`。
- 第三条是另一个包自己的问题：handler 调用的名字不是它导出的那个。

## 第三轮：修完重装（0.1.2）

```
dsh plugin --profile probe-web add --registry=https://registry.npmjs.org dsh-check-suite@0.1.2
# resolved 33, downloaded 25, done in 21.4s
dsh --profile probe-web --port 3099 --no-open
```

27 个端点逐个 `POST {"path": …}`：

```
adr-check        200  {"ok":false,"checked":{"consequences":0,"lines":6},"errors":3,…}
commit-msg-check 200  {"ok":true,"checked":{"type":"fix","subject":4,"lines":2},…}
perf-report-check 200 {"ok":false,"checked":{"lines":6,"percentiles":0},"errors":2,…}
… 27/27 全部 200
```

`adr-check` 的 `text` 与 `path` 两种输入逐字相同（857 字节）。

## 留下来的东西

- `test/route-parity.test.js` 现在按目录推导用例（27 个包全覆盖），并对每个包断言
  「同一份文档走 `path` 与 `text` 必须逐字相同」。手写样例只是补充有意义的输入。
- `scripts/audit-mirror.mjs` 对账 registry 与镜像的 `latest`，按 suite 依赖闭包清点 33 个包；
  `--sync` 触发镜像重新抓取。`stale-stage` 单独成一类：它不会自己好。
- 缺陷台账第 20、21 条就是这两件事，回放方式是起一个真 socket 去 POST。

## 做不到的那一步：让模型自己调用

`dsh-document-check` 注册的是 agent 工具，所以最直接的验证是「让一个真实会话自己决定调用它」。
这一条在这台机器上没做成，两次尝试都卡在同一处：

1. 从 `headless` 模板新建 profile，装好包，`dsh --profile probe-hl "…"` →
   `MISSING_CREDENTIAL: no API key for provider route "deepseek-official"`。
2. 把该 profile 的模型改成桌面版正在用的 `zhanlu-cnh`（连同 154 行 provider 表一起抄过去）→
   `MISSING_CREDENTIAL: no credential for provider route "zhanlu-cnh"; its profile resolves
   ZHANLU_CNH_API_KEY, which is not set`。

结论：凭证由 credentials service 按 profile 持有，换一个 profile 就解析不到。唯一的办法是往
主人正在用的 profile 里装这个包——那是别人在用的东西，不为了自证去动它。

已验到的三件事（都有产物）：`apply()` 用 stub ctx 断言注册了 `document_check`；装好的包里
`execute({check:'adr-check', text})` 返回 `ok:false, 3 errors, 1 warning`；工具与 host 路由对
同一份文档逐条相同（`test/tool-route-parity.test.js`，32 个检查）。差的那一步写在
`packages/dsh-document-check/README.md` 的诚实边界里：现在是「没有反例」，不是「已验证」。
