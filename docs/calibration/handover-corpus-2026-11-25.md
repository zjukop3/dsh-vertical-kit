# handover-check 在真实 HANDOVER.md 上的一次测量（2026-11-25）

这一页记的是测量结果和结论，还没改代码。写下来的原因：语料是这轮才找到的，
不记下来下一轮又得重新找一遍。

## 方法

GitHub code search：`filename:HANDOVER.md` → **24,864 份**。取前 30 份，用 contents API
逐份下载（公开仓库，只读，不入仓）；29 份正文 ≥500 字符，用于测量。

同一套方法已经用在两处：`meeting-notes.md`（575 份 → 用 60 份，45 份实质）和
`label:bug` 的真实 issue（404 份）。code search 是目前唯一能稳定拿到「陌生人写的某类文档」
的入口，比抽样公开语料库更接近真实分布。

## 结果

```
29 份真实 HANDOVER.md → 只有 6 份通过（21%）
handover-person-missing 21   receiver-missing 21   signoff-missing 20
access-unlisted 18           date-unlabelled 15    pending-missing 13
no-owners 12                 date-missing 8        technical-handover 6
```

## 结论：不是一个体裁，是三个

现有的判据只认第一种，`isSessionHandover()` 认第二种，所以第三种被当成第一种判。

| 体裁 | 特征 | 现在怎么判 |
|---|---|---|
| 组织交接（离职/岗位/项目移交） | 交接人、接收人、签字、账号与权限 | 正确（现有规则） |
| 会话交接（agent 上下文交接） | Current State / What Was Done / Files Changed / Next steps | 已识别（`technical-handover`，只 warn） |
| 项目交接笔记（个人项目交给下一个人） | 更新时间、仓库、分支、HEAD、背景、已完成、待办、怎么继续 | **被当成组织交接判**，21 份里的多数属于这一类 |

典型样本（`Doulor/FluidBar` 的 HANDOVER.md，公开仓库）：

```
# FluidBar v2 接手文档（Handover）
> 更新时间：2026-10-19 16:40   > 仓库：…   > 分支：v2/rebuild   > HEAD：b41b293 …
## 1. 用户与产品背景（接手必须知道）
```

它没有「接收人」，因为它写给「下一个接手的人」而不是某个具体同事；没有签字，因为
没有组织流程；但它有状态、有背景、有下一步——对读者是有用的交接文档。

## 下一轮的做法（已定，不含猜测）

1. 三个体裁各自的必填集合：
   - 组织交接：现状规则不变；
   - 会话交接：现状（已识别，只 warn）；
   - 项目交接笔记：**状态**（仓库/分支/当前可运行到哪）、**已完成**、**未完成/待办**、
     **怎么继续**（运行/测试/复现）。缺项给 warn——这类文档本来就是随手写的。
2. 判据用**结构**而不是关键词：有没有「交接人 / 接收人 / 签字」这类组织字段决定是不是
   第一种；有没有 state/branch/HEAD/next steps 决定是不是第二、三种。
3. 量完之后才发版；发版前把这一页的数字改成新版判据下的数字。
