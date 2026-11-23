# 语料出处

这五份 yaml 是 **awesome-dsh-plugin 仓库里已合并的真实条目**（不是我编的例子），
2026-11-23 从 `awesome-dsh-plugin/awesome-dsh-plugin@main` 的 `data/plugins/` 取出，
逐字未改：

| 文件 | 状态 |
| --- | --- |
| `zjukop3__dsh-vertical-kit--packages-dsh-adr-check.yml` | 已合并 |
| `zjukop3__dsh-vertical-kit--packages-dsh-license-check.yml` | 已合并 |
| `zjukop3__dsh-vertical-kit--packages-dsh-ops-runbook-check.yml` | 已合并 |
| `zjukop3__dsh-vertical-kit--packages-dsh-security-advisory-check.yml` | 已合并 |
| `zjukop3__dsh-vertical-kit--packages-dsh-document-check.yml` | 我自己的待评审条目（PR #18109） |

它们的作用是**校准**，不是展示：这五份必须零发现。第一版检查在它们身上报出四种误报——
「缺少 description」（内容在嵌套映射里）、「#sub 与子目录不一致」（拿整条路径去比）、
「描述里有占位符」（正文里合法提到的 `<name>`）、「中文像占位」（拿汉字数比英文字符数）。
四条都是同一个毛病：量的是我以为的写法，不是上游真实的样子。
