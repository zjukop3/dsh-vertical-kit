# dsh-plugin-package-check

Check that a DSH plugin package is **installable and findable** before you publish it.
Ten rules, all decidable from the package directory: no network, no running your code, no
registry.

<!-- example:start -->
## 真实输入输出

输入：命令里那个包目录（目录型输入，不是一份文档）

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ plugin-package-check ./packages/dsh-adr-check
ok: dsh-adr-check 0 errors, 0 warnings
```

出口码：0。
<!-- example:start -->

The catalog's most common rejection is a `package.json` that declares only `dsh.client` —
that alone is not installable, and `dsh plugin add` fails. The quieter failure is the one
below: everything declared, patch file present, but `files` drops the patch, so it runs
locally and breaks for everyone who installs it.

<!-- install:start -->
## 装进 DSH

```bash
dsh plugin --profile <profile> add dsh-plugin-package-check
```

`--profile` 是 `dsh plugin` 的必填项（Desktop 用 `desktop`，Web 用 `web`）。装完在「插件」里启用，对话中就有这条检查的 host 路由；不装 DSH 也能用上面的 `npx`。
<!-- install:end -->

## 它判定什么 / What it decides

| rule | level | what it decides |
| --- | --- | --- |
| `manifest-missing` | error | the directory has no `package.json` |
| `manifest-unparsable` | error | `package.json` is not valid JSON |
| `private` | error | `private: true` — it cannot be published to npm |
| `bundle-missing` | error | no `dsh.bundle.patch` — `dsh plugin add` cannot install it |
| `patch-missing` | error | `dsh.bundle.patch` points at a file that is not there |
| `patch-empty` | error | the patch has no `insert` row — the layer mounts nothing |
| `patch-name-mismatch` | error | the patch mounts neither this package nor one of its declared dependencies |
| `files-omits-patch` | warn | `files` exists but does not include the patch — the published tarball lacks it |
| `files-omits-detail` | warn | `docs/DETAIL.md` exists but is not shipped — the plugin detail page stays empty |
| `engines-missing` | warn | no `engines.dsh` — a reader cannot tell whether it fits their DSH |
| `bin-name-mismatch` | warn | `bin` has no key equal to the package name — `npx <package>` will 404 |
| `readme-missing` / `readme-install-missing` | warn | no README, or no `dsh plugin add …` line in it |
| `locale-missing` | warn | no `locale/` — the plugin page shows a package name and nothing else |
| `icon-missing` | warn | no icon — the plugin card is blank |

## Requirements

- Node `>=22.19.0`. No dependencies.
- DSH `>=0.2.2-rc.1 <0.3.0-0` only for the host route; the CLI needs neither DSH nor a network.

## Install (CLI)

```
npx dsh-plugin-package-check ./packages/my-plugin
```

## 输出示例 / What you should see

A real run against a package that declares a patch file which is not in the same directory:

```text
error patch-missing dsh.bundle.patch 指向 ./cordis.patch.yml，但目录里没有这个文件
warn  engines-missing engines.dsh 没写——读者无从判断这个包跟自己的 DSH 版本兼不兼容
warn  locale-missing 没有 locale/——插件页只能显示包名，没有标题与说明
warn  icon-missing 没有图标（./icon 导出或 icon.svg）——插件卡片是空白的
fail: my-plugin 1 errors, 3 warnings
```

Exit codes: 0 clean (warnings do not fail), 1 errors, 2 usage. It takes under 1 second — it reads a handful of files and runs nothing.

## Install into DSH (host route)

```
dsh plugin --profile <profile> add dsh-plugin-package-check
```

then `POST /plugin-package-check/api` with `{"path": "/abs/path/to/package"}`. The route
and the CLI call the same function, so they cannot disagree.

## 诚实的边界 / Honest scope

- **Calibrated on seven plugins other people wrote**, already installed on this machine:
  `dsh-wechat`, `dsh-media-desk`, `dsh-bili-scroll`, `dsh-context`, `dsh-guizang-design`,
  `dsh-purge-community`, `@claude-mem/dsh`. Five pass with at most two warnings; the two
  that fail do so for reasons I checked by hand — `dsh-purge-community` has no `bin` key
  equal to its package name, so `npx dsh-purge-community` 404s (the same mistake I made in
  27 of my own packages), and `@claude-mem/dsh` is `private: true`.
- **The first version was wrong about aggregation bundles.** It required the patch to name
  the package itself; `dsh-check-suite` legitimately mounts its dependencies instead. The
  rule now accepts either, and the suite is in the gate that requires this kit's own 30
  packages to produce zero findings.
- **It cannot tell whether the plugin works.** It checks the packaging contract, not the
  behaviour: whether the patch mounts the right entry, whether the icon is a good icon,
  whether anyone wants the feature.
- **Installed packages are not the same artifact as published tarballs.** Checking a
  directory in `node_modules` sees what npm chose to ship — which is exactly the point of
  `files-omits-patch`, but the inverse mistake (a file in the directory that the tarball
  drops) can only be seen by checking the unpacked tarball. `npm pack --dry-run` does that.

## Getting help

Open an issue at <https://github.com/zjukop3/dsh-vertical-kit/issues> with the package.json
(redact anything private), the command, and this tool's verbatim output. A finding you
believe is wrong is a bug report about a rule, and the rule name is in the message.

## License

MIT.