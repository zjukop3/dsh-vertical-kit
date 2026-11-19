# Changelog

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
