# dsh-listing-check

E-commerce listing hygiene from CSV/JSON exports: title length bounds, keyword stuffing, price validity and bounds, SKU completeness and duplicates.

<!-- install:start -->
## 装进 DSH

```bash
dsh plugin --profile <profile> add dsh-listing-check
```

`--profile` 是 `dsh plugin` 的必填项（Desktop 用 `desktop`，Web 用 `web`）。装完在「插件」里启用，对话中就有这条检查的 host 路由；不装 DSH 也能用上面的 `npx`。
<!-- install:end -->

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
title,price,sku
全自动懒人支架手机桌面通用, 29.9, SKU001
手机支架手机支架手机支架通用, 9.9, SKU002
超便宜, 0, SKU003
便宜货, 39.9, SKU002
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ listing-check listings.csv
error title-short 第3行 第 3 行标题 3 字，少于下限 10：「超便宜…」
error price-invalid 第3行 第 3 行价格「0」不是 ≥ 0.01 的数字
error title-short 第4行 第 4 行标题 3 字，少于下限 10：「便宜货…」
error sku-duplicate 第4行 第 4 行 SKU「SKU002」与第 2 行重复
warn title-stuffing 第2行 第 2 行关键词「手机支架」重复 3 次（上限 3）
fail: 4 rows, 4 errors, 1 warnings
```

出口码：1。
<!-- example:start -->

A listing is decidable from the export: title length bounds, repeated keywords, price validity, SKU completeness. This verifies exactly those, with configurable bounds, and says which row failed.

```bash
npx dsh-listing-check listings.csv --json
npx dsh-listing-check listings.csv --min-title 10 --max-title 60 --max-price 9999
```

Exit codes: `0` clean, `1` findings, `2` usage or read error. In DSH the same function is behind `POST /listing-check/api` with `{"text":"…"}` or `{"path":"…"}`, so the panel and CI agree by construction.

## What it decides

商品导出表是否达到可上架的结构卫生：标题长度边界、关键词堆砌（连写与分隔重复两种形态）、价格有效性与上限、SKU 完整性与重复。每条发现报行号，边界可配置。

## Honest scope

这是上架前的结构检查，不是运营建议：它说清单**结构上干净**，从不说商品**会卖得好**。堆砌判定认两种形态；单字重复在中文标题里是常态，永不计入。

Part of [dsh-vertical-kit](https://github.com/zjukop3/dsh-vertical-kit): industry-scenario checks, each one verb, each runnable without DSH.

MIT.
