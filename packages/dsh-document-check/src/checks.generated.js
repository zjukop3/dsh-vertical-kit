// 由 scripts/sync-agent-tools.mjs 生成，勿手改。
// 31 个检查：本仓库 27 个 + verify-kit 4 个。
// 手改的话，新加一个检查包时这条工具会静默漏掉它——而报错看起来像「没有这个检查」。
export const CHECKS = [
  { slug: 'adr-check', pkg: 'dsh-adr-check', exportName: 'lintAdr', genre: "架构决策记录检查 / ADR 检查" },
  { slug: 'agreement-check', pkg: 'dsh-agreement-check', exportName: 'lintContract', genre: "合同检查 / 合同审查清单" },
  { slug: 'api-doc-check', pkg: 'dsh-api-doc-check', exportName: 'lintApiDoc', genre: "接口文档检查 / API 文档检查" },
  { slug: 'bug-report-check', pkg: 'dsh-bug-report-check', exportName: 'lintBugReport', genre: "缺陷报告检查 / bug 报告检查" },
  { slug: 'citelint', pkg: 'dsh-citelint', exportName: 'lintCitations', genre: "citelint" },
  { slug: 'commit-msg-check', pkg: 'dsh-commit-msg-check', exportName: 'lintCommitMessage', genre: "提交信息检查 / commit message 检查" },
  { slug: 'contributing-check', pkg: 'dsh-contributing-check', exportName: 'lintContributing', genre: "贡献指南检查 / CONTRIBUTING 检查" },
  { slug: 'dockerfile-check', pkg: 'dsh-dockerfile-check', exportName: 'lintDockerfile', genre: "Dockerfile 检查 / 镜像构建检查" },
  { slug: 'env-example-check', pkg: 'dsh-env-example-check', exportName: 'lintEnvExample', genre: "环境变量示例检查 / .env 检查" },
  { slug: 'expense-claim-check', pkg: 'dsh-expense-claim-check', exportName: 'lintExpenseClaim', genre: "报销单检查 / 费用报销检查" },
  { slug: 'handover-check', pkg: 'dsh-handover-check', exportName: 'lintHandover', genre: "交接单检查 / 离职交接检查" },
  { slug: 'incident-report-check', pkg: 'dsh-incident-report-check', exportName: 'lintIncidentReport', genre: "事故复盘检查 / 故障报告检查" },
  { slug: 'invoice-check', pkg: 'dsh-invoice-check', exportName: 'lintInvoice', genre: "发票检查 / 发票校验" },
  { slug: 'license-check', pkg: 'dsh-license-check', exportName: 'lintLicense', genre: "许可证检查 / LICENSE 检查" },
  { slug: 'listing-check', pkg: 'dsh-listing-check', exportName: 'lintListings', genre: "电商商品信息检查 / listing 检查" },
  { slug: 'meeting-notes-check', pkg: 'dsh-meeting-notes-check', exportName: 'lintMeetingNotes', genre: "会议纪要检查 / 会议记录检查" },
  { slug: 'migration-guide-check', pkg: 'dsh-migration-guide-check', exportName: 'lintMigrationGuide', genre: "迁移指南检查 / 升级指南检查" },
  { slug: 'numberlint', pkg: 'dsh-numberlint', exportName: 'lintNumbers', genre: "numberlint" },
  { slug: 'onboarding-check', pkg: 'dsh-onboarding-check', exportName: 'lintOnboarding', genre: "上手指南检查 / 新人文档检查" },
  { slug: 'ops-runbook-check', pkg: 'dsh-ops-runbook-check', exportName: 'lintOpsRunbook', genre: "运维手册检查 / runbook 检查" },
  { slug: 'outline-lint', pkg: 'dsh-outline-lint', exportName: 'lintOutline', genre: "outline-lint" },
  { slug: 'perf-report-check', pkg: 'dsh-perf-report-check', exportName: 'lintPerfReport', genre: "性能报告检查 / 压测与基准报告" },
  { slug: 'pr-description-check', pkg: 'dsh-pr-description-check', exportName: 'lintPrDescription', genre: "PR 描述检查 / 拉取请求描述检查" },
  { slug: 'privacy-notice-check', pkg: 'dsh-privacy-notice-check', exportName: 'lintPrivacyNotice', genre: "隐私声明检查 / 隐私政策检查" },
  { slug: 'release-notes-check', pkg: 'dsh-release-notes-check', exportName: 'lintReleaseNotes', genre: "发布说明检查 / 更新日志检查" },
  { slug: 'resume-check', pkg: 'dsh-resume-check', exportName: 'lintResume', genre: "简历检查 / 求职简历检查" },
  { slug: 'security-advisory-check', pkg: 'dsh-security-advisory-check', exportName: 'lintSecurityAdvisory', genre: "安全公告检查 / 漏洞公告检查" },
  { slug: 'spec-doc-check', pkg: 'dsh-spec-doc-check', exportName: 'lintSpecDoc', genre: "需求文档检查 / 方案文档检查" },
  { slug: 'tablelint', pkg: 'dsh-tablelint', exportName: 'lintTables', genre: "tablelint" },
  { slug: 'test-report-check', pkg: 'dsh-test-report-check', exportName: 'lintTestReport', genre: "测试报告检查 / 用例统计检查" },
  { slug: 'weekly-report-check', pkg: 'dsh-weekly-report-check', exportName: 'lintWeeklyReport', genre: "周报检查 / 工作汇报检查" },
]

export const SLUGS = CHECKS.map(entry => entry.slug)

export const BY_SLUG = new Map(CHECKS.map(entry => [entry.slug, entry]))
