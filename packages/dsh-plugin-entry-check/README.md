# dsh-plugin-entry-check

Check an [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
entry before you submit it. Every rule here comes from the catalog's own
`contributing.md`, and every rule is one round trip you don't have to spend.

Submitting an entry means getting a filename, a `name`, a `url`, a subpackage path and a
category all pointing at the same thing. The catalog's CI says "the shape is wrong";
this says which line.

## 它判定什么 / What it decides

Sixteen rules over the entry file itself — nothing that needs the network, nothing that
needs the repository:

| rule | level | what it decides |
| --- | --- | --- |
| `empty` | error | the file has nothing in it |
| `yaml-shape` | error | lists, block scalars, tabs, nesting deeper than `description:` — this check only supports the shape entries actually use, and says so instead of guessing |
| `duplicate-key` | error | a key written twice, which YAML silently resolves to the last one |
| `unknown-key` | error | a key outside `url` / `name` / `category` / `description` / `icon` |
| `missing-key` | error | `url`, `name`, `category` or `description` missing |
| `url-shape` | error | not `https://github.com/<owner>/<repo>` with an optional `/tree/<ref>/<path>`; trailing slash, `.git`, `blob/` |
| `name-shape` | error | `owner/repo[#sub]`, and the same repository the `url` points at |
| `sub-path` | error | `#sub` must equal the **last** segment of the `url` path, and one implies the other |
| `category` | error | must be one of the 23 values the catalog accepts |
| `description-keys` | error | both `en` and `zh` present |
| `description-placeholder` | error | the description is still `TODO` / `lorem` |
| `description-thin` | warn | too short to tell a reader what the plugin does |
| `description-parity` | warn | the Chinese half is much shorter than the English one (compared by 汉字 vs 词, not 字符) |
| `icon-shape` | warn | not an absolute https URL, or not an image extension |
| `bundle-hint` | warn | the description itself says "install a set of plugins" — catalog rule #7 does not list aggregation bundles |
| `filename` | warn | the filename does not match `owner__repo--path.yml` derived from the `url` |

## Requirements

- Node `>=22.19.0`. No dependencies — the YAML it accepts is parsed by 40 lines here, so
  `npx` works without installing a parser.
- DSH `>=0.2.2-rc.1 <0.3.0-0` only if you want the host route; the CLI needs neither DSH
  nor a network connection.

## Install (CLI)

```
npx dsh-plugin-entry-check ./data/plugins/zjukop3__dsh-vertical-kit--packages-dsh-adr-check.yml
```

## 输出示例 / What you should see

A real run against an entry with three mistakes — a `name` pointing at another repo, a
category that does not exist, and a stub description:

```text
error name-shape 第0行 name 指向 someone/else，url 指向 owner/repo——评审会看这两个是不是同一个仓库
error category 第0行 category「documents」不在上游的 23 个取值里：agi ui usage theme model identity session memory tools wsl browser vision voice docs skill workflow git notify dev security remote market fun
warn description-thin 第0行 description.en 只有 14 字符——一条说不清「它做什么」的条目，读者会跳过
warn description-thin 第0行 description.zh 只有 4 个汉字——中文读者读到的信息量太少
warn icon-shape 第0行 icon 用绝对 https 地址——相对路径在目录页里解析不了
fail: 3 errors, 3 warnings
```

Exit codes: 0 clean, 1 errors, 2 usage. Warnings never block — a thin description is a
judgement call, an unknown category is not. It takes under 1 second.

## Install into DSH (host route)

```
dsh plugin --profile <profile> add dsh-plugin-entry-check
```

`--profile` is required by the CLI. With the plugin installed, the same rules answer at
`POST /plugin-entry-check/api` with `{"text": "..."}` or `{"path": "..."}` — the route
and the CLI call the same function, so they cannot disagree.

## 诚实边界 / Honest scope

- **Calibrated on five real entries.** Four merged into the catalog and one of mine
  pending; they are in `fixtures/` with their source noted, and the test suite requires
  them to produce zero findings. My first version produced four false positives on them:
  a nested `description:` read as missing, `#sub` compared against the whole path, a
  legitimate `<name>` in prose read as a placeholder, and Chinese compared against
  English by character count.
- **It cannot read your repository.** Whether the package declares `dsh.bundle`, whether
  the repo is a day old, whether the code is real — the catalog's reviewers decide those.
- **It cannot apply rule #7.** Only a hint: if the description says "install a set of
  plugins", it warns. A bundle that does something itself is a plugin and should say
  what it does.
- **The YAML subset is deliberate.** Lists, block scalars and deeper nesting are refused
  with a message rather than parsed approximately, because an entry misread as invalid
  costs more than an entry the tool refuses to look at.

## Getting help

Open an issue at <https://github.com/zjukop3/dsh-vertical-kit/issues> with the entry file
(as a redacted snippet), the command, and this tool's verbatim output. If the catalog
changed a rule, that is a bug here too — cite the line in `contributing.md`.

## License

MIT.