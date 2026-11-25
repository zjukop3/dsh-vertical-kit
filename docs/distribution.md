# 这些包出现在哪里（以及为什么这一页要存在）

影响力不是「发布」这一步，而是「别人在自己的目录里找到你」。这一页记的是事实，不是愿景：
每个目录 / 列表 / 注册表，投了什么、状态如何、结果如何。没写日期的不算存在。

## 已收录

| 目录 | 形式 | 内容 | 状态 |
|---|---|---|---|
| [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | 每个插件一份 `data/plugins/*.yml` | 36 条（29 个检查 + 5 个 verify-kit 检查 + review-outbox + package-check） | 已合并 |

最后一条 [PR #18341](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/18341)（`dsh-plugin-package-check`）
于 2026-11-24 合并，落在 `category: dev`。

`dsh-check-suite` 仍不在其中：它是纯聚合包（该目录第 7 条不收），这是规则，不是遗漏。

## 已提交、等回复

| 目录 | 提交 | 日期 | 内容 |
|---|---|---|---|
| [whyihaveyou/dsh-suite](https://github.com/whyihaveyou/dsh-suite) | [#228](https://github.com/whyihaveyou/dsh-suite/issues/228) | 2026-11-24 | `dsh-document-check`（32 个检查一条工具） |
| [walkinglabs/awesome-deepseek-harness-plugins](https://github.com/walkinglabs/awesome-deepseek-harness-plugins) | [#163](https://github.com/walkinglabs/awesome-deepseek-harness-plugins/issues/163) | 2026-11-24 | `dsh-document-check` |
| [white0dew/awesome-dsh-plugins](https://github.com/white0dew/awesome-dsh-plugins) | [#46](https://github.com/white0dew/awesome-dsh-plugins/issues/46) | 2026-11-24 | `dsh-document-check` |

## 提给上游的意见

| 位置 | 内容 | 日期 |
|---|---|---|
| [awesome-dsh-plugin#18455](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/issues/18455) | `contributing.md` 的规则比实际合并的严格：全量 12,960 份条目里有 91 份按实践写、44 份连示例的行内注释一起抄、3 份是 JSON | 2026-11-24 |
| [awesome-dsh-plugin#18834](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/18834) | 上述 issue 的回复（维护者 fkysly：「glad to take a doc PR doing both (1) and (2)」）→ 提了文档 PR：把「CI 自动检查」与「维护者阅读」分开列，示例 YAML 去掉注释，加一行本地自查命令 | 2026-11-25 |

## 观察到的竞争

同一个目录里，同类「文档检查」在被别人陆续提交：`dsh-lc-doc-check`、`dsh-gongwen-word-check`、
`dsh-gongwen-flow-check`、`dsh-customs-doc-check`、`dsh-construction-doc-check`、`dsh-pipeline-check`。
它们的共同点是**一个体裁一个包、一个明确的读者**（公文、海关、施工资料）。这一对比说明：
29 个检查横向铺开不如「某一类人一看就知道是自己那份文件」的纵向切入。

## 还没做、也不假装做了的事

- 没有任何外部 issue 或 PR 提到过这些包（采用率 0，2026-11-24）。
- npm 上周下载 14,668 次，时间序列证明是自动化流量（发布当天起爆、之后每天 30–60），不是人。
- 自上而下投放（往 6 个目录批量提交 35 个条目）没做，也不打算做：那是噪音，不是影响力。
