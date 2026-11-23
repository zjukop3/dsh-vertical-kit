# dsh-hashcheck

A manifest records the SHA-256 of every file you delivered. Verification says which bytes moved since — a changed file, a missing file, and a file that was delivered but never listed are three different failures, and only the first two get caught by eyeballing a folder.

<!-- example:start -->
## 真实输入输出

输入：

```markdown
delivery/
├── report.md      ← 交付后有人改了一个字
├── nested.csv
└── hashcheck.json
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ dsh-hashcheck build ./delivery
delivery/hashcheck.json: 2 files, sha256
$ dsh-hashcheck verify delivery/hashcheck.json --dir ./delivery
ok: 2 checked, 0 errors, 1 warnings

# 有人改了 report.md 之后再验：
$ dsh-hashcheck verify delivery/hashcheck.json --dir ./delivery
error changed report.md changed: expected d2f56516fd6c…, found 99527e917f49…
warn unlisted hashcheck.json is on disk but not in the manifest
fail: 2 checked, 1 errors, 1 warnings
```

出口码：改前 0，改后 1。
<!-- example:start -->

```bash
npx dsh-hashcheck build ./delivery --out delivery/hashcheck.json --ignore node_modules
npx dsh-hashcheck verify delivery/hashcheck.json --dir ./delivery
```

Exit codes: `0` clean, `1` findings, `2` usage or read error. In CI, gate on the exit code; in DSH, the same two functions are behind `POST /hashcheck/api` with `{"action":"build"|"verify"}` so the panel and the pipeline cannot disagree.

Deterministic by construction: paths are sorted and normalized to forward slashes, no timestamps or mtimes enter the digest, so the same tree produces the same manifest on macOS, Linux and Windows.

## What it decides

一次交付的字节是否与清单一致：`build` 对文件树产出排序归一的 SHA-256 清单，`verify` 对着清单逐个校验，报告哪些文件动了、哪些是新增、哪些消失了。

## Honest scope

这是防篡改证据，不是验收意见：它证明**字节动没动**，不能证明改动是改进还是破坏。清单不含时间戳与 mtime，同一棵树在 macOS/Linux/Windows 产出同一份清单。

Part of [dsh-verify-kit](https://github.com/zjukop3/dsh-verify-kit): generic deliverable defects, each one verb, each runnable without DSH.

MIT.
