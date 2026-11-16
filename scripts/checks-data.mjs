export const ORIGIN = process.env.PUBLIC_ORIGIN || 'https://zjukop3.github.io/dsh-vertical-kit'
export const REPO = 'https://github.com/zjukop3/dsh-vertical-kit'
export const KIT = 'https://zjukop3.github.io/dsh-verify-kit/'

export const CHECKS = [
  {
    slug: 'agreement-check',
    npm: 'dsh-agreement-check',
    cli: 'agreement-check',
    noun: '合同检查 / 合同审查清单',
    title: '合同结构检查清单',
    description: '合同交给法务之前，先把结构定下来：甲乙方写没写、日期有没有锚、大写金额和数字对不对得上、签署栏、争议解决、违约责任。每条发现带行号，可接 CI。',
    decides: '这份合同在结构上是否可审',
    rules: [
      ['party-a / party-b', '没有「甲方：/乙方：」行，或名称为空 → error，报行号'],
      ['date', '全文无日期 → error；有日期但没有「签订/签署日期」字样 → warn'],
      ['amount-uppercase', '有数字金额但全文没有大写金额 → error'],
      ['amount-mismatch', '大写金额与所有数字金额都对不上 → error，报两边的值'],
      ['amount-ambiguous', '出现多个大写金额 → warn（自动比对仅在恰好一个时进行）'],
      ['signature', '没有「甲方（盖章）/乙方（盖章）」式签署栏 → error'],
      ['dispute', '没有争议解决条款（仲裁/诉讼/管辖）→ error'],
      ['breach', '没有违约责任条款 → error'],
      ['term', '没有期限条款 → warn'],
    ],
    usage: [
      'npx agreement-check contract.md --json',
      'npx agreement-check contract.md --warnings-fail',
    ],
    example: {
      "command": "agreement-check contract-sample.md",
      "fixture": "甲方：甲科技有限公司\n乙方：乙网络工作室\n\n本合同总金额为人民币壹万贰仟元整（¥13,000元）。\n\n甲方（盖章）\n乙方（盖章）",
      "output": "$ agreement-check contract-sample.md\nerror date 全文没有任何日期，合同无法锚定生效时间\nerror amount-mismatch 大写金额 12000（第 4 行）与所有数字金额（13000@4）都对不上\nerror dispute 没有争议解决条款（仲裁/诉讼/管辖）\nerror breach 没有违约责任条款\nwarn term 没有期限条款（合同期限/有效期/履行期限）\nfail: 4 errors, 1 warnings",
      "exit": "1"
},
    note: '大写金额解析器按 GB 习惯读 壹贰叁…拾佰仟万亿元角分整，支持「拾万元整」的 leading 拾 和 角分小数；解析不了的串返回 null 并计入歧义，不会编一个数出来。',
  },
  {
    slug: 'invoice-check',
    npm: 'dsh-invoice-check',
    cli: 'invoice-check',
    noun: '发票检查 / 发票校验',
    title: '发票字段检查清单',
    description: '发票不需要懂业务就能核对的部分：统一社会信用代码字符集、不含税+税额=价税合计的勾稽、大写金额与小写一致、发票号码位数。容差默认 0.02，可调。',
    decides: '发票上能从文本判定的算术与格式是否成立',
    rules: [
      ['credit-code', '18 位统一社会信用代码字符集校验（数字 + A-HJ-NPQRTUWXY，排除 I/O/S/V/Z）→ error'],
      ['invoice-number', '发票号码 20 位（数电票）或 8 位（纸质票）之外 → warn'],
      ['amount-sum', '不含税 + 税额 ≠ 价税合计（超出容差）→ error，报三项的值'],
      ['amount-partial', '勾稽三项缺一 → warn，点名缺哪个'],
      ['amount-uppercase', '大写金额与价税合计不一致 → error'],
      ['amount-ambiguous', '出现多个大写金额 → warn'],
      ['buyer / seller', '没有购买方/销售方名称栏 → error'],
    ],
    usage: [
      'npx invoice-check invoice.txt --json',
      'npx invoice-check invoice.txt --tolerance 0.02',
    ],
    example: {
      "command": "invoice-check invoice-sample.txt",
      "fixture": "发票号码：24512000000123456789\n统一社会信用代码：91330106MA27X8XXXX\n购买方名称：甲科技有限公司\n销售方名称：乙网络工作室\n不含税金额（小写）：¥11,320.75\n税额（小写）：¥679.25\n价税合计（小写）：¥12,001.00\n价税合计（大写）：壹万贰仟元整",
      "output": "$ invoice-check invoice-sample.txt\nerror amount-sum 第 5 行勾稽不平：不含税 11320.75 + 税额 679.25 = 12000，价税合计却是 12001（容差 0.02）\nerror amount-uppercase 大写金额 12000（第 8 行）与价税合计 12001（第 7 行）不一致\nfail: 2 errors, 0 warnings",
      "exit": "1"
},
    note: '勾稽是发票自己的算术，不是税务合规：税率是否适用、抬头是否对，都不在这五个判定里。',
  },
  {
    slug: 'listing-check',
    npm: 'dsh-listing-check',
    cli: 'listing-check',
    noun: '电商商品信息检查 / listing 检查',
    title: '电商商品信息检查清单',
    description: '商品导出表（CSV/JSON）交付或上架前的检查：标题长度边界、关键词堆砌、价格有效性与边界、SKU 完整性与重复。每条发现报行号，边界可配置。',
    decides: '商品导出表是否达到可上架的结构卫生',
    rules: [
      ['title-short / title-long', '标题字符数越界（默认 10–60，可配）→ error，报行号与字数'],
      ['title-stuffing', '同一关键词连写三遍或分隔出现三次以上 → warn，报词与次数'],
      ['title-missing', '没有标题列或该行为空 → error'],
      ['price-invalid', '价格不是 ≥ 0.01 的数字 → error'],
      ['price-high', '价格超过上限（--max-price 配置）→ warn'],
      ['sku-missing / sku-empty', 'SKU 列缺失或为空 → error'],
      ['sku-duplicate', 'SKU 与更早的行重复 → error，报两行行号'],
    ],
    usage: [
      'npx listing-check listings.csv --json',
      'npx listing-check listings.csv --min-title 10 --max-title 60 --max-price 9999',
    ],
    example: {
      "command": "listing-check listings.csv",
      "fixture": "title,price,sku\n全自动懒人支架手机桌面通用, 29.9, SKU001\n手机支架手机支架手机支架通用, 9.9, SKU002\n超便宜, 0, SKU003\n便宜货, 39.9, SKU002",
      "output": "$ listing-check listings.csv\nerror title-short 第3行 第 3 行标题 3 字，少于下限 10：「超便宜…」\nerror price-invalid 第3行 第 3 行价格「0」不是 ≥ 0.01 的数字\nerror title-short 第4行 第 4 行标题 3 字，少于下限 10：「便宜货…」\nerror sku-duplicate 第4行 第 4 行 SKU「SKU002」与第 2 行重复\nwarn title-stuffing 第2行 第 2 行关键词「手机支架」重复 3 次（上限 3）\nfail: 4 rows, 4 errors, 1 warnings",
      "exit": "1"
},
    note: '堆砌检测两种形态都认：连写（手机支架手机支架手机支架）和分隔重复；单字重复在中文标题里是常态，永不计入。认得的列名：标题 title/商品名称/名称，价格 price/售价，SKU sku/编码/货号。',
  },
  {
    slug: 'meeting-notes-check',
    npm: 'dsh-meeting-notes-check',
    cli: 'meeting-notes-check',
    noun: '会议纪要检查 / 会议记录检查',
    title: '会议纪要检查清单',
    description: '会议纪要发出或归档前的书记检查：日期、与会人、决定都有记录，每个行动项都有负责人和截止时间。勾选框和待办标题下的编号项算任务，普通编号讨论点不算。每条发现报行号。',
    decides: '这份纪要是否交代了谁在何时 carries 什么',
    rules: [
      ['date-missing', '全文没有任何日期（2026-11-16、11月16日、11/16、下周三）→ error'],
      ['attendees-missing', '没有与会人/参会人/出席/Attendees 行或标题 → error'],
      ['action-no-owner', '行动项没有负责人（负责人：…、@名字、X 负责）→ error，报行号'],
      ['action-no-deadline', '行动项没有截止时间（11月20日前、2026-11-20、下周三）→ error，报行号'],
      ['agenda-missing', '没有议程/议题标题或编号讨论点 → warn'],
      ['decisions-missing', '没有决定/决议/结论 → warn（信息里写明：会议真的没有决定就忽略）'],
      ['no-action-items', '没有任何行动项 → warn（同样带出口）'],
    ],
    usage: [
      'npx meeting-notes-check notes.md --json',
      'npx meeting-notes-check notes.md --no-require-agenda',
    ],
    example: {
      "command": "meeting-notes-check meeting-sample.md",
      "fixture": "# 项目周会\n\n- 日期：2026-11-15\n- 与会人：张三、李四、王五\n\n## 议程\n\n1. 讨论登录页改版\n2. 评审导出性能\n\n## 行动项\n\n- [ ] 登录页模板替换\n- [ ] 导出性能基线测试 负责人：李四",
      "output": "$ meeting-notes-check meeting-sample.md\nerror action-no-owner 第13行 第 13 行行动项没有负责人（认得：负责人：…、@名字、X 负责）：「- [ ] 登录页模板替换…」\nerror action-no-deadline 第13行 第 13 行行动项没有截止时间（认得：11月20日前、2026-11-20、下周三）\nerror action-no-deadline 第14行 第 14 行行动项没有截止时间（认得：11月20日前、2026-11-20、下周三）\nwarn decisions-missing 第0行 没有记录任何决定/决议/结论——如果这次会议真的没有决定，忽略这条\nfail: 2 action items, 3 errors, 1 warnings",
      "exit": "1"
},
    note: '只验记录格式，不判断会议质量：它验证纪要写清了谁在何时 carries 什么，不能验证张三真的接了任务。编号行是整份纪要的组织方式，只有勾选框和行动标题下的编号项算任务。',
  },
  {
    slug: 'resume-check',
    npm: 'dsh-resume-check',
    cli: 'resume-check',
    noun: '简历检查 / 求职简历检查',
    title: '简历检查清单',
    description: '简历投递或筛阅前的书记检查：联系方式可达、邮箱电话形态合法、工作经历时间线不自相重叠、教育段在场。时间线按月比较，教育段写在当前工作之后不误报。空窗默认只提示不判错。',
    decides: '这份简历在书记层面是否可读、可达、时间自洽',
    rules: [
      ['contact-missing', '没有电话/手机/邮箱/微信/Email/Phone → error'],
      ['email-invalid', '邮箱过不了严格形态（连续点、域缺尾）→ error，报行号；检测宽松、验证严格，坏地址必被检出'],
      ['phone-invalid', '电话位数不在 7-15 位 → error，报行号'],
      ['dates-overlap', '两段经历时间重叠 → error，报两段区间'],
      ['dates-order', '一段封闭经历开始于「至今」之后 → error（真矛盾，不是文档顺序问题）'],
      ['date-gap', '两段之间空窗 >12 个月 → warn，仅 --no-allow-gaps 时判'],
      ['education-missing', '没有教育/学历段 → warn'],
    ],
    usage: [
      'npx resume-check resume.md --json',
      'npx resume-check resume.md --no-allow-gaps',
    ],
    example: {
      "command": "resume-check resume-sample.md",
      "fixture": "# 李四\n\n- 邮箱：lisi..wrong@site\n- 电话：12345\n\n## 工作经历\n\n**A公司** 工程师 2020.1 - 2022.6\n**B公司** 工程师 2021.5 - 2023.1\n**C公司** 工程师 2022.3 - 至今\n**D公司** 工程师 2023.2 - 2024.1",
      "output": "$ resume-check resume-sample.md\nerror email-invalid 第3行 第 3 行邮箱「lisi..wrong@site」不是合法形态（连续点或域缺尾）\nerror phone-invalid 第4行 第 4 行电话位数 5 不在 7-15 位之间\nerror dates-overlap 第9行 第 9 段经历（2021.5 - 2023.1）与上一段（2020.1 - 2022.6）时间重叠\nerror dates-overlap 第10行 第 10 段经历（2022.3 - 至今）与上一段（2021.5 - 2023.1）时间重叠\nerror dates-order 第11行 第 11 段（2023.2 - 2024.1）开始于「至今」的经历之后——如果是笔误请改成结束日期，如果确实是新经历请把上一段改为结束日期\nwarn education-missing 第0行 没有教育/学历信息（认得：## 教育背景、本科/硕士/博士、毕业院校）\nfail: 4 stints, 5 errors, 1 warnings",
      "exit": "1"
},
    note: '只验书记层面，不验内容真伪：它验证文档可达、形态合法、时间自洽；内容是否诚实是面试的事。认得的日期形态：2020.3-2022.5、2020年3月-2022年5月、2020/3 ~ 2022/5、2020-03 至今。',
  },
]

