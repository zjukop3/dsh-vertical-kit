# 装一遍、调一遍：2026-11-24 的端到端验证

上一份（`install-and-call-2026-11-23.md`）验的是「装得上、端点能应答」。这一次验的是三件更具体的事：

1. 今天发布到 npm 的字节里，**修好的那三条正则真的在**——不是版本号对，是内容对；
2. 从**镜像**（不指定 registry，也就是真实用户默认走的那条路）装一遍，34 个端点逐个调用；
3. 用台账里那三份复现文档，确认**误报在已发布的包里已经不报**。

顺带撞出一个新问题（`hashcheck` 的端点键名与默认目录），已在 `dsh-verify-kit` 0.1.5 修掉。

## 环境

- DSH CLI `0.2.2-rc.5`（Desktop 包内，`/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`）。
- profile 名 `probe-kit-20261124`，**从 web 模板重建**：`dsh probe-kit-20261124 --from-default-profile web`。
  第一次是先 `dsh plugin --profile … add` 再启动，结果 34 个插件全部 `pending (waiting for service: webServer)`——
  裸 profile 里没有 web server 插件，安装顺序不能反。
- 安装命令不带 `--registry`，走默认的 npmmirror：

```
$ dsh plugin --profile probe-kit-20261124 add dsh-check-suite@0.1.9 dsh-document-check@0.1.2
Packages: +36
Progress: resolved 36, reused 0, downloaded 36, added 36, done in 1.7s
+ dsh-check-suite 0.1.9
+ dsh-document-check 0.1.2
```

- 端口 `3098`，只绑 `127.0.0.1`，启动后 `GET /` → `401`（要 token，符合预期）。

## 一、发布的字节里有没有修好的东西

五个版本先等 `dist.tarball` 真的可下载（首发之后 `404` 会持续几分钟，这次重试了 6 轮）：

```
dsh-handover-check@0.2.6        200  10099   gzip-ok
dsh-onboarding-check@0.3.7      200  10601   gzip-ok
dsh-privacy-notice-check@0.1.5  200   7624   gzip-ok
dsh-check-suite@0.1.9           200   5892   gzip-ok
dsh-document-check@0.1.2        200  11003   gzip-ok
```

镜像侧同样五个都能下来、且是合法 gzip（`dist.tarball` 指向 npmmirror 自己的地址，不是转发 npmjs）。
然后解包、在**发布出去的 `src/index.js`** 里找那三行：

```js
// dsh-handover-check 0.2.6
const ACCOUNT_ENTRY = /\b[\w.@-]+@[\w.-]+\.\w+|\b(?:GitHub|…|Slack)\b|(?:阿里云|腾讯云|数据库|飞书|钉钉)|(?:账号|权限|密钥|token|secret)/i
// dsh-onboarding-check 0.3.7
if (!/\b(?:confirm|verify|check that|should see|you should)\b|(?:即成功|说明成功|确认|验证)/i.test(String(text))) {
// dsh-privacy-notice-check 0.1.5
if (/^#\s+\S/m.test(source)) return 'heading'
```

三行都在。版本号对不等于内容对，所以要 grep。

## 二、34 个端点逐个调

统一用 `{"path":"/tmp/probe-docs/generic.md"}` 打一遍：

```
200s: 32/34
BAD hashcheck 400 {"error":"action must be build or verify"}
BAD plugin-package-check 400 {"error":"not a directory: /tmp/probe-docs/generic.md"}
```

两个 400 都是**按设计**拒绝：`hashcheck` 要 `action`，`plugin-package-check` 要一个包目录而不是文件。
按各自的契约重打：

```
POST /plugin-package-check/api {"path": ".../node_modules/dsh-handover-check"}
→ {"ok":true,"errors":0,"warnings":0,"findings":[],"checked":{"package":"dsh-handover-check","version":"0.2.6","rules":15}}
```

这条顺带证明装上去的确实是 0.2.6，且它对自己不咬人。

## 三、撞出来的新问题：hashcheck 静默扫了 cwd

`hashcheck` 的端点键名是 `directory`，另外 30 个检查收的都是 `path`。我按统一写法发 `{"path": …}`，
它不认这个键、退回 `.`，于是：

```
POST /hashcheck/api {"action":"build","path":"/tmp/probe-docs"}
→ {"manifest":{"files":{".git/COMMIT_EDITMSG":…, ".git/HEAD":…}}}     # 37687 个文件
```

它哈希的是**服务进程的当前目录**（这个仓库，含 `.git`），不是我要的那个临时目录。

两件事都不对：

- 一个客户端要对 31 个检查写例外，这就是「装上了但没人用」的典型摩擦点；
- 更糟的是默认值。一个会把 cwd 里 `.env`、`.git/config` 一起吐进响应的默认值，比缺少参数更危险。

`dsh-hashcheck` 0.1.5：

- `path` 与 `directory` 都收，`path` 优先，两者返回逐字节相同的清单；
- 没有目录 → `400 {"error":"directory (or path) is required — this check does not scan its own cwd"}`；
- 端点契约测试钉住这两条（alias 等价、缺目录拒绝）。

## 四、三份复现文档在已发布的包里不再误报

台账第 28–30 条的那三份输入，直接打已发布的端点（`path` 传文件）：

```
POST /handover-check/api        → {"ok":true,"checked":{"items":3,"accounts":true},"errors":0,"warnings":1,
                                   "findings":[{"level":"warn","rule":"no-owners",…}]}
POST /onboarding-check/api      → {"ok":true,"checked":{"blocks":0,"genre":"task-guide","steps":2},"errors":0,"warnings":0,"findings":[]}
POST /privacy-notice-check/api  → {"ok":true,"checked":{"lines":26},"errors":0,"warnings":1,
                                   "findings":[{"level":"warn","rule":"rights-missing",…}]}
```

`access-empty`、`verify-missing`、`title-missing` 三条误报全部消失；剩下的 `no-owners`（三条事项没写负责人）
和 `rights-missing`（没写用户权利）是这两份文档**确实缺**的东西，不是误报。

## 没验到的

- **没碰 `desktop` profile**。这是本机唯一有模型凭证的 profile，往里装包会改本人正在用的环境。
  所以「装进 DSH 之后 agent 真的会调它」这一条，仍然只有 `document_check` 工具的离线测试，
  没有活模型的反例。README 里照旧写着这一句。
- 镜像的 `dist-tags.latest` 这次五个包都对（`0.2.6 / 0.3.7 / 0.1.5 / 0.1.9 / 0.1.2`），
  但上一轮踩过 `0.0.0-stage` 的坑，所以每次发版后仍然要显式查一遍。
- `probe-kit-20261124` 这个 profile 留着，方便复现；它不持有任何凭证。
## 下午补记：bug-report-check 0.1.4 的同一套验证

`dsh plugin --profile … add dsh-bug-report-check@0.1.4` 第一次**失败**：

```
The latest release of dsh-bug-report-check is "0.1.3". Published at 11/23/2026
```

npmjs 上 0.1.4 的 metadata 与 tarball 都在，但镜像的 `dist-tags.latest` 还停在 0.1.3。
PUT 触发 sync 后仍等了约 5 分钟才翻（`0.1.3 → 0.1.4`、`0.1.10 → 0.1.11`、`0.1.2 → 0.1.3`
三个一起翻）。装成功之后直接打已发布的端点：

```
POST /bug-report-check/api {"path":"/tmp/b1.md"}   # "# bug"
→ ok=false mode=review {"steps":0,"repro":"none","env":"none","emptySubmission":true,...}
  error:env-missing, error:repro-missing, warn:expectation-unstated

POST /bug-report-check/api {"path":"/tmp/b2.md"}   # "# 崩溃" + 一个链接
→ 同上（一条链接不算最小复现）

POST /bug-report-check/api {"path":"/tmp/b3.md"}   # 真实形状：加粗段名 + VS Code 版本 + 3 步 + Expected/Actual
→ ok=true mode=review {"steps":3,"repro":"steps","env":"label","expectedActual":"pair"}
  同一份文档 strict 模式也 ok
```

`checked` 里写清楚判据看到了什么（`repro`/`env`/`expectedActual`/`emptySubmission`），
不是一个笼统的 `ok`——这样一条误报可以直接看出是哪一路判据认错了。

## 傍晚补记：镜像的 lazy fetch（第三次踩同一个坑，这次记清楚）

`dsh-plugin-entry-check@0.1.2` 发布之后，npmjs 上 metadata 和 tarball 都在，但镜像的
`dist-tags.latest` 连续 15 分钟停在 `0.1.1`，两次 `PUT /sync` 也没用：

```
mirror latest=0.1.1   versions: 0.0.0-stage,0.1.0,0.1.1
```

原因是这份包首发时 `dist.tarball` 404 了近 8 分钟，镜像那次抓取失败了。有效的办法不是
再 sync，而是**显式请求那个版本**，让镜像去懒加载：

```
GET https://registry.npmmirror.com/dsh-plugin-entry-check/0.1.2   # 200
GET https://registry.npmmirror.com/dsh-plugin-entry-check/-/dsh-plugin-entry-check-0.1.2.tgz  # 200，14407 字节
# 30 秒后 dist-tags.latest 变成 0.1.2
```

之后 `dsh plugin --profile … add dsh-plugin-entry-check@0.1.2` 一次成功（+ 1.0s），
直接打已发布的端点（`POST /plugin-entry-check/api`，带 `repo`）：

```
{"path":"/tmp/entry-handover.yml","repo":"…/dsh-vertical-kit"}
→ ok=true errors=0 warnings=0 {"keys":5,"languages":2,"repoChecked":"./packages/dsh-handover-check"}

{"path":"/tmp/entry-handover.yml","repo":"…/dsh-review-outbox"}
→ ok=false error:repo-package-missing
```

一个结论写进下次的检查单：**`PUT /sync` 只保证「我请了」，不保证「他抓到了」；
首发 tarball 404 过的包，要显式 GET 那个版本的 metadata 或 tarball。**
