# Changelog

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
