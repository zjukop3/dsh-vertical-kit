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
]

