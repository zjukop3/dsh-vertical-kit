# Changelog

## [0.12.0] — 2026-11-19

第十六、第十七个同族缺陷，来自 11 份**别人写的** CHANGELOG。

- **dsh-release-notes-check 0.3.0（第十六个）**：`<details>` 折叠区不再参与排序。一份真实 changelog 把未发布的 alpha 重列在折叠的历史附录里，并注明"内容已并入上一版"——那不是顺序主张。同一仓库的英文版把同一条放在折叠区**外面**，那才是真的顺序断裂，仍然报出。
- **dsh-release-notes-check 0.3.0（第十七个）**：报的行号系统性偏上一行。标题模式从标题**前**的换行开始匹配，而行号一直数到那个换行，于是每条 `order` 都指向版本标题上方的空行。用户按报的行号去找会落在空行上。已修，finding 现在落在标题那一行。
- dogfood 闸扩到十三条断言，新增第三方 CHANGELOG 语料。
- 第三方语料第四类打通：README、LICENSE、CHANGELOG、Dockerfile/.env.example——五个检查现在有陌生人写的文件跑过。

**升级路径**：`order` 的判定只会少报（折叠区豁免），行号修正后如果 CI 里按行号断言过，需要跟着改。

## [0.11.0] — 2026-11-19

第十四、第十五个同族缺陷，都来自 21 份**别人写的** LICENSE。修前 15 份全过，修后 19 份；剩两份是真缺陷。

- **dsh-license-check 0.2.0（第十四个）**：版权行原来取"第一个含 copyright 的行"，而 Apache-2.0 的定义段就长这样——`"Licensor" shall mean the copyright owner…`。四份完全正确的 LICENSE 因此被判"既没年份也没版权人"。现在认声明的形状：`copyright`/`©` 后面紧跟 `(c)`、四位年份或方括号槽位。
- **dsh-license-check 0.2.0（第十五个）**：占位符的严重程度要看许可证，而不是看行长得像什么。MIT/BSD/ISC 的正条文要求填声明，空槽是 error；Apache-2.0、MPL-2.0、GPL 系的附录本来就是供抄走的模板，空槽是一句 warn（`notice-template-unfilled`，只报一次，不是两条 error）；正文不是任何标准许可证时仍是 error——那份文本还没人同意过。
- 剩下的两份失败是真缺陷，写进了语料页：`ECNU__EduWork` 的正文不是任何标准许可证；`op7418__dsh-guizang-design` **标题写 MIT、正文是 AGPL-3.0**。
- dogfood 闸扩到十二条断言，新增第三方 LICENSE 语料，并锁死上面三处：Apache 定义行不许算声明、Apache 附录槽位不许报 error、标题与正文不一致必须仍被报出。

**升级路径**：三处都只减少误报，唯一新增的报错面是"正文不是标准许可证 + 留了占位符"，那一类本来就是缺陷。

## [0.10.0] — 2026-11-19

第十二、第十三个同族缺陷，都来自同一份语料：39 份**别人写的** README（其他插件仓库）。修前 5 份全过，修后 6 份。

- **dsh-onboarding-check 0.3.0（第十二个缺陷）**：`dsh plugin add <spec>` 不在命令白名单里——而这是本生态装插件的标准命令，生态里 216 个文件用它。`dsh-bot` 的 README 明明有一条能粘贴的 `dsh plugin add dsh-bot`，被报"没有可粘贴的命令"。为 DSH 做的工具不认识 `dsh`，量的是自己的词汇。`command-missing` 从 11 份降到 4 份。
- **dsh-onboarding-check 0.3.0（第十三个缺陷）**：`dsh-todo-inbox` 的成功提示写在安装块的 shell 注释里——`# 重启 dsh web，侧边栏底部出现"待办"区块即成功`。我为了防自我引用把**所有**代码块都遮蔽了，于是作者说的话被当成不存在。遮蔽收窄成只遮蔽"本检查自己的输出"（层级 + 规则名 + `第N行`），自我引用防护仍在：重复本检查报错文本的 README 依然不能靠它通过。
- 这两条是同一个下午、同一份语料找出来的，而**第二条是修第一条之前某个缺陷时引入的**。
- dogfood 闸扩到十一条断言，新增第三方 README 语料，并锁死这两处：`dsh plugin …` 在代码块里就不许报 `command-missing`；`dsh-todo-inbox` 不许报 `success-missing`。

**升级路径**：两处都只减少误报。`prereq-missing`（25/39）与 `success-missing`（24/39）仍然对真实 README 报出，那是真缺口，不是误报。

## [0.9.0] — 2026-11-19

第**十**份语料，也是第一份**第三方**语料：目录调研拉下来的两个 Dockerfile 和一个 .env.example。

- **dsh-env-example-check 0.2.0**：保留示例域名与 loopback 现在算占位符（`example.com/org/net/edu/test`、`*.test`、`*.invalid`、`localhost`、`127.0.0.1`）。触发它的是别人仓库里一个 `.env.example`：唯一的问题是文档里写了 `https://remote.example.edu/...`，被本检查判成"提交了真值"。对正确文档报错的规则，下场是整个文件被从 CI 里删掉，而不是被修好。
- 第三方 Dockerfile 一净一脏：`ECNU__EduWork` 那份 0 error；`ranxianglei__billion-context` 那份以 root 收尾——**真缺陷，不是误报**。这条写进了语料页，说明检查确实会对陌生人的文件报错。
- dogfood 闸扩到十条断言，新增「第三方语料能被读且不崩」——不是要求它们干净，而是要求每条 finding 都指名道姓。
- 站点新增 `/corpus/`：逐条自报哪些检查有真实语料（九条）、哪些只有自造样例（十一条），以及为什么这个区分决定了"装上去第一天会不会误报"。首页加入口。
- `.github/ISSUE_TEMPLATE/corpus-report.yml`：一条提交脱敏真实文档的通道。十一类没有语料的检查，我一个人补不上——我没有别人的合同、简历、报销单。

**升级路径**：`env-example-check` 只会少报误报，不会对真值放行（`https://relay.mycompany.cn/...`、`sk-live-...` 仍然报 error）。

## [0.8.0] — 2026-11-19

审计加上「嫌疑守卫」这一类别，并把一个诚实的边界写进输出。

- 某条规则藏在 `if (` 后、条件里有**能匹配空字符串的正则字面量**时，报告为嫌疑而不是结论。判定用引擎（`new RegExp(body).test('')`），不是文本匹配：第一版把 `/^https?:\/\//` 里的 `//` 误判成空正则，正是本 kit 反复复发的同一个错。
- 报告措辞明确写出**静态分析分不出"死规则"与"没人写触发测试"**——一条没有触发测试的规则，症状在两种情况下完全一样，只有人去写那条测试才会知道是哪一种。三条死规则（`subject-empty`、`sku-empty`、`empty-heading`）都是这样被发现的：不是因为审计诊断出了它们，而是因为写测试的人写了测试，然后发现它不会红。
- 审计自身补了 9 条测试（`test/audit-rules.test.js`），now 双向覆盖审计功能本身。

**升级路径**：只影响 `npm run check` 的阻断条件，不影响任何已发布包的运行时行为。

## [0.7.0] — 2026-11-19

第二十二个包：`dsh-expense-claim-check`（报销单检查），十二条规则。

- 换来的那条是 `total-mismatch`：明细相加 1,513.50、合计写 1,600.00 的报销单，页面上看起来完全正常——数字整齐、表格对齐，而合计正是审批人真正读的那个数。差出来的要么是从上一张抄的，要么是往上凑的。`invoice-duplicate` 同理：一张单子两行、日期不同、号码一样，没有人会去数位数。
- 金额解析前先剥掉发票号和日期，否则十四位发票号会变成一个七十三万亿元的明细行；金额上限一千万，超过按数据错误处理而不是计入合计。
- 币种按代码比较而不是按写法：裸「元」算 CNY，`美元`/`欧元` 先匹配再遮蔽，它们的「元」不会被误读。
- 造这个包的过程中自己踩了本 kit 已经记录过的 CJK `\b` 陷阱（`\b发票号码` 在中文逗号后永不匹配），首次冒烟就报出「有发票号却说没有」；另有期限判定传了个永远为真的正则。两处都在测试前修掉。

**升级路径**：新增包，不影响已发布的二十一个。

## [0.6.0] — 2026-11-19

第五份语料进了 dogfood 闸：四份 runbook。修了第六个同族缺陷。

- **dsh-ops-runbook-check 0.2.0**：`## 3. 构建月报页` 这样的编号标题现在算步骤。旧版只认 `1. …` 列表项，于是本项目自己的两份 runbook（步骤就是按编号标题组织的）被报"完全没有编号步骤"——和另外四个包犯的是同一个错：要的是拼写不是性质。编号标题会带上它的段内正文，因为命令在标题下面，所以 `destructive-unwarned` 改看整步（标题+正文），报错位置指到步骤而不是命令行。
- 四份 runbook（OPERATIONS、INSTALL-RECOVERY、MONTHLY-RUNBOOK、RELEASE-RUNBOOK）补齐前置条件；MONTHLY-RUNBOOK 还补了「验证」（三件按顺序确认的事，含 Pages 部署等待与 sitemap 收录）和「回滚」（`git revert` 而不是就地改一版覆盖，历史期次按日期命名不覆盖）。
- dogfood 闸扩到八条断言：README、CHANGELOG、LICENSE、ADR、事故复盘、runbook、真实提交历史、语料规模自检。

**升级路径**：`steps-missing` 只会少报错，不会新报；`destructive-unwarned` 的报错位置从命令行改到步骤起始行，如果 CI 里按行号断言过，需要跟着改。

## [0.5.0] — 2026-11-19

用真文档喂检查器：写了三条决策记录（ADR）和一份事故复盘，全部由对应检查校验通过，并接进 dogfood 闸。

- **dsh-adr-check 0.2.0**：`consequences-one-sided` 与 `consequences-unlabelled` 改读**整个后果段**，不只看项目符号。把「好处：」写在段落行、好处列在下面，是真实 ADR 最常见的写法；旧版只看列表文本，于是把已标注的权衡判成未标注。这与本 kit 另外四个包犯的是同一个错——量的是拼写不是性质。
- 新增 `docs/adr/ADR-0001`（规则必须双向测试）、`ADR-0002`（下载量只读成底噪带）、`ADR-0003`（pending 队列不批量处置）与 `docs/incidents/2026-11-17-shapes-sample-contaminated.md`，站点新增 `/decisions/` 页。
- dogfood 闸扩到七条断言：README、CHANGELOG、LICENSE、ADR、事故复盘、真实提交历史，以及语料规模自检。

**升级路径**：`adr-check` 只会少报误警，不会新报错。已接受旧版报错的 ADR 重跑一次即可看到差异。

## [0.4.0] — 2026-11-19

第二十一个包上线：`dsh-handover-check`（交接单检查）。

- **dsh-handover-check 0.1.0**：十条规则——交接人、接收人、生效日期、事项条数与负责人、账号与权限段、未完成事项、接收人签字。它换来的那条是 `access-unlisted`：签名和日期是评审一眼能看出来的东西，账号段是没人看的那段，漏掉一个只读后台账号今天不报错，下次审计才报错，而那时交接人已经走了。允许写「无账号需交接」显式豁免——豁免必须写出来，不能靠沉默通过。
- 事项条数与账号扫描都按 `## 交接事项` / `## 账号与权限` 段内统计：否则账号列表里的项目符号会让三件事的交接单看起来像七件，账号段的标题本身也会因为含「账号」二字而冒充一条账号。
- 日期正则用 `[ \t]` 而不是 `\s`：`\s` 会把行尾的换行吃进匹配，报错信息里就带出一个空行。

**升级路径**：新增包，不影响已有的二十个。

## [0.3.0] — 2026-11-19

加了第三道闸（`scripts/audit-rules.mjs`，已接进 `npm run check`），并修掉它在过程中找出的两条死规则。

- **规则双向审计**：每条规则都必须在测试里被观察到两个方向——坏文档让它报，好文档让它闭嘴。只被观察到"会报"的规则是半条规则；四个包正是因为只有这半条而全部误报（见 0.2.0 三条与下文 pr-description）。审计结果 138/138。
- **dsh-commit-msg-check 0.3.0**：`subject-empty` 之前是死规则——`HEADER` 要求冒号后 `.+`，所以 `feat:` 根本解析不成类型，这条永远不可能触发。改成 `.*` 后 `feat:` 报 `subject-empty`，测试覆盖双向。
- **dsh-listing-check 0.2.0**：`sku-empty` 同样是死规则——`pick()` 有意跳过空值，于是"有 SKU 列但单元格为空"被当成"没有 SKU 列"报 `sku-missing`。新增 `columnName()` 单独回答"这一列在不在"，空单元格现在报 `sku-empty`。

**升级路径**：两处都是**新增报错**，不是放宽。`feat:` 这类冒号后无主题的提交信息从"只报 type-missing"变成"报 subject-empty"；空 SKU 单元格从 `sku-missing` 变成 `sku-empty`。如果你的 CI 依赖旧规则名做判断，按新名字改。

## [0.2.0] — 2026-11-19

三个检查升到 0.2.0，起因是拿它们跑自家仓库（102 条提交、23 个 README、3 个 CHANGELOG），三个都暴露了问题——两个在检查本身，一个在文档。

- **dsh-commit-msg-check 0.2.0**：`type-missing` 从 error 降为 warn。102 条提交里 85 条（83%）没有 Conventional Commits 前缀——这是流派，不是缺陷；58 条（56%）主题超 72 字，那是真问题，仍是 error。`requireType` 变成三态（`warn`/`error`/`off`），0.1.0 的布尔值照旧映射（`true`→error、`false`→off），不认识的值回落到 warn 而不是 off——一个笔误不该悄悄关掉检查。CLI 新增 `--require-type` / `--no-require-type`。
- **dsh-onboarding-check 0.2.0**：结构规则改成只读正文——代码块与表格行先遮蔽。原来一个 README 只要展示本检查的输出（输出里有「认得：## 前置条件、需要先…」），或规则表里写着 `no 前置条件 section`，就能骗过 `prereq-missing`；本 kit 二十个 README 里有两个正是这么"通过"的。同时 `## 输出示例`、`## Output`、`## Demo` 也算"成功长什么样"，逐字真输出比检查原本要求的措辞更能回答这个问题。
- **dsh-release-notes-check 0.2.0**：认 `## [1.2.0] - 2026-11-17`。这是 Keep a Changelog 规定的写法，也是绝大多数 changelog 的实际写法，之前只认 `## 1.2.0` 和 `## v1.2.0`，于是对本项目自己的三个 CHANGELOG 全报 `version-missing`。排序规则一并读方括号形式。
- 二十个 README 补上了前置要求段（Node ≥ 22.19、DSH 范围），`package.json` 的 `engines` 早就写了，README 一直没说。

- **dsh-pr-description-check 0.2.0**：`what`/`test` 认内容证据（改动列表、测试数/audit/CI 结果），不再只认小标题；`why` 从 error 降为 warn——动机判不了，`because` 在解释代码时比在讲理由时更常见，本项目自己的一个 PR 就是靠「because `#` is a non-word character」蒙过 `why-missing` 的。`BREAKING` 改成只认行首声明，正文里描述"某检查会抓破坏性变更"不再被当成自己声明了破坏性变更（本项目两个 PR 中招）。19 个已合并 PR 从 19/19 报错降到 1/19，剩下那个是真没写验证。

**升级路径**：行为变更有两处。`type-missing` 不再阻断提交，`why-missing` 同样不再阻断。想让它们继续阻断的团队，钩子里加 `--require-type` / `--require-why`；不想看这两条的加 `--no-require-type` / `--no-require-why`。另两个包是检测面变宽，只会少报错，不会新报错。想让类型前缀继续阻断的团队，钩子里加 `--require-type`；不想看这条的加 `--no-require-type`。另两个包是检测面变宽，只会少报错，不会新报错。

## [0.1.2/0.1.3] - 2026-11-15

- dsh-agreement-check 0.1.3: the cordis.patch.yml and route prefix compose under the package's own name — the rename from dsh-contract-check had left the published patch stale, so installs composed as dsh-contract-check and the README's /agreement-check/api 404ed. Found by the profile-level install verification of the combined market index.
- dsh-invoice-check 0.1.2 / dsh-listing-check 0.1.2: republish wave with `engines.dsh` declared and icons shipped in-repo.
- 0.1.1 versions were gap-fills published while latest had already moved on; the dist-tags lesson is recorded in review-outbox's RELEASE-RUNBOOK.

## [0.1.0] - 2026-11-10

- Initial publication wave: three packages (agreement-check, invoice-check, listing-check), each with a main function, CLI, and host route; 18 tests covering real fixtures and exit codes.
