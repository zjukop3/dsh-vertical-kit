// 由 scripts/sync-agent-tools.mjs 生成，勿手改。
// 32 个检查：本仓库 28 个 + verify-kit 4 个。
// 手改的话，新加一个检查包时这条工具会静默漏掉它——而报错看起来像「没有这个检查」。
// local 是开发仓里的回落路径：安装后按包名解析（用户那边全靠它），在没有装齐依赖的
// 工作区里按相对路径读到隔壁包的源码。少了这个回落，工作区测试实际测的是 node_modules
// 里已发布的旧副本——绿着，但测的不是这份代码。
export const CHECKS = [
  { slug: 'adr-check', pkg: 'dsh-adr-check', exportName: 'lintAdr', local: "../../dsh-adr-check/src/index.js", genre: "架构决策记录检查 / ADR 检查" },
  { slug: 'agreement-check', pkg: 'dsh-agreement-check', exportName: 'lintContract', local: "../../dsh-agreement-check/src/index.js", genre: "合同检查 / 合同审查清单" },
  { slug: 'api-doc-check', pkg: 'dsh-api-doc-check', exportName: 'lintApiDoc', local: "../../dsh-api-doc-check/src/index.js", genre: "接口文档检查 / API 文档检查" },
  { slug: 'bug-report-check', pkg: 'dsh-bug-report-check', exportName: 'lintBugReport', local: "../../dsh-bug-report-check/src/index.js", genre: "缺陷报告检查 / bug 报告检查" },
  { slug: 'citelint', pkg: 'dsh-citelint', exportName: 'lintCitations', local: "../../../dsh-verify-kit/packages/dsh-citelint/src/index.js", genre: "citelint" },
  { slug: 'commit-msg-check', pkg: 'dsh-commit-msg-check', exportName: 'lintCommitMessage', local: "../../dsh-commit-msg-check/src/index.js", genre: "提交信息检查 / commit message 检查" },
  { slug: 'contributing-check', pkg: 'dsh-contributing-check', exportName: 'lintContributing', local: "../../dsh-contributing-check/src/index.js", genre: "贡献指南检查 / CONTRIBUTING 检查" },
  { slug: 'dockerfile-check', pkg: 'dsh-dockerfile-check', exportName: 'lintDockerfile', local: "../../dsh-dockerfile-check/src/index.js", genre: "Dockerfile 检查 / 镜像构建检查" },
  { slug: 'env-example-check', pkg: 'dsh-env-example-check', exportName: 'lintEnvExample', local: "../../dsh-env-example-check/src/index.js", genre: "环境变量示例检查 / .env 检查" },
  { slug: 'expense-claim-check', pkg: 'dsh-expense-claim-check', exportName: 'lintExpenseClaim', local: "../../dsh-expense-claim-check/src/index.js", genre: "报销单检查 / 费用报销检查" },
  { slug: 'handover-check', pkg: 'dsh-handover-check', exportName: 'lintHandover', local: "../../dsh-handover-check/src/index.js", genre: "交接单检查 / 离职交接检查" },
  { slug: 'incident-report-check', pkg: 'dsh-incident-report-check', exportName: 'lintIncidentReport', local: "../../dsh-incident-report-check/src/index.js", genre: "事故复盘检查 / 故障报告检查" },
  { slug: 'invoice-check', pkg: 'dsh-invoice-check', exportName: 'lintInvoice', local: "../../dsh-invoice-check/src/index.js", genre: "发票检查 / 发票校验" },
  { slug: 'license-check', pkg: 'dsh-license-check', exportName: 'lintLicense', local: "../../dsh-license-check/src/index.js", genre: "许可证检查 / LICENSE 检查" },
  { slug: 'listing-check', pkg: 'dsh-listing-check', exportName: 'lintListings', local: "../../dsh-listing-check/src/index.js", genre: "电商商品信息检查 / listing 检查" },
  { slug: 'meeting-notes-check', pkg: 'dsh-meeting-notes-check', exportName: 'lintMeetingNotes', local: "../../dsh-meeting-notes-check/src/index.js", genre: "会议纪要检查 / 会议记录检查" },
  { slug: 'migration-guide-check', pkg: 'dsh-migration-guide-check', exportName: 'lintMigrationGuide', local: "../../dsh-migration-guide-check/src/index.js", genre: "迁移指南检查 / 升级指南检查" },
  { slug: 'numberlint', pkg: 'dsh-numberlint', exportName: 'lintNumbers', local: "../../../dsh-verify-kit/packages/dsh-numberlint/src/index.js", genre: "numberlint" },
  { slug: 'onboarding-check', pkg: 'dsh-onboarding-check', exportName: 'lintOnboarding', local: "../../dsh-onboarding-check/src/index.js", genre: "上手指南检查 / 新人文档检查" },
  { slug: 'ops-runbook-check', pkg: 'dsh-ops-runbook-check', exportName: 'lintOpsRunbook', local: "../../dsh-ops-runbook-check/src/index.js", genre: "运维手册检查 / runbook 检查" },
  { slug: 'outline-lint', pkg: 'dsh-outline-lint', exportName: 'lintOutline', local: "../../../dsh-verify-kit/packages/dsh-outline-lint/src/index.js", genre: "outline-lint" },
  { slug: 'perf-report-check', pkg: 'dsh-perf-report-check', exportName: 'lintPerfReport', local: "../../dsh-perf-report-check/src/index.js", genre: "性能报告检查 / 压测与基准报告" },
  { slug: 'plugin-entry-check', pkg: 'dsh-plugin-entry-check', exportName: 'lintPluginEntry', local: "../../dsh-plugin-entry-check/src/index.js", genre: "目录条目检查 / 收录条目检查" },
  { slug: 'pr-description-check', pkg: 'dsh-pr-description-check', exportName: 'lintPrDescription', local: "../../dsh-pr-description-check/src/index.js", genre: "PR 描述检查 / 拉取请求描述检查" },
  { slug: 'privacy-notice-check', pkg: 'dsh-privacy-notice-check', exportName: 'lintPrivacyNotice', local: "../../dsh-privacy-notice-check/src/index.js", genre: "隐私声明检查 / 隐私政策检查" },
  { slug: 'release-notes-check', pkg: 'dsh-release-notes-check', exportName: 'lintReleaseNotes', local: "../../dsh-release-notes-check/src/index.js", genre: "发布说明检查 / 更新日志检查" },
  { slug: 'resume-check', pkg: 'dsh-resume-check', exportName: 'lintResume', local: "../../dsh-resume-check/src/index.js", genre: "简历检查 / 求职简历检查" },
  { slug: 'security-advisory-check', pkg: 'dsh-security-advisory-check', exportName: 'lintSecurityAdvisory', local: "../../dsh-security-advisory-check/src/index.js", genre: "安全公告检查 / 漏洞公告检查" },
  { slug: 'spec-doc-check', pkg: 'dsh-spec-doc-check', exportName: 'lintSpecDoc', local: "../../dsh-spec-doc-check/src/index.js", genre: "需求文档检查 / 方案文档检查" },
  { slug: 'tablelint', pkg: 'dsh-tablelint', exportName: 'lintTables', local: "../../../dsh-verify-kit/packages/dsh-tablelint/src/index.js", genre: "tablelint" },
  { slug: 'test-report-check', pkg: 'dsh-test-report-check', exportName: 'lintTestReport', local: "../../dsh-test-report-check/src/index.js", genre: "测试报告检查 / 用例统计检查" },
  { slug: 'weekly-report-check', pkg: 'dsh-weekly-report-check', exportName: 'lintWeeklyReport', local: "../../dsh-weekly-report-check/src/index.js", genre: "周报检查 / 工作汇报检查" },
]

export const SLUGS = CHECKS.map(entry => entry.slug)

export const BY_SLUG = new Map(CHECKS.map(entry => [entry.slug, entry]))
