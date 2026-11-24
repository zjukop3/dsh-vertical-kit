# Plugin package check

Check that a DSH plugin package is installable and findable before you publish it. Fifteen
rules, all decidable from the package directory: no network, no running your code.

## What it does

The catalog's most common rejection is a `package.json` that declares only `dsh.client` —
that alone is not installable. The quieter failure is the one this check earns its place
with: everything declared, the patch file present, but `files` drops the patch, so the
package runs locally and breaks for everyone who installs it.

It reads four things: `package.json`, the patch file it points at, `files`, and whether the
README/locale/icon exist. It reports what a reader would hit — an install that cannot work,
a card with no title, an `npx <package>` that 404s because no `bin` key equals the package
name.

## How to use it

```
npx dsh-plugin-package-check ./packages/my-plugin
```

Installed into DSH it answers at `POST /plugin-package-check/api` with `{"path": "…"}` —
this one takes a directory, not a document, so it is the only check in the kit whose route
does not accept `{"text": …}`. Its contract is covered by its own test rather than the
text-based parity matrix.

## What it returns

```
error patch-missing dsh.bundle.patch 指向 ./cordis.patch.yml，但目录里没有这个文件
warn  engines-missing engines.dsh 没写——读者无从判断这个包跟自己的 DSH 版本兼不兼容
```

Exit codes: 0 clean, 1 errors, 2 usage. Warnings never fail.

## Calibration

Seven plugins other people wrote, already installed on this machine, plus this kit's own
thirty packages. Two of the third-party ones produce findings I checked by hand:
`dsh-purge-community` has no `bin` key equal to its package name, so `npx
dsh-purge-community` 404s, and `@claude-mem/dsh` is `private: true`.

The first version produced two mistakes of its own:

- It required the patch to mount the package itself, which fails aggregation bundles —
  `dsh-check-suite` mounts its dependencies, and that is correct.
- It carried a `dir-name-mismatch` rule that fired on temporary directories and on
  unpacked tarballs, where the directory name has nothing to do with the package. Removed
  rather than tuned.

## Limitations

- It cannot tell whether the plugin works, only whether it can be installed and seen.
- It cannot see files that the directory has and the tarball drops — that needs
  `npm pack --dry-run`. It does catch the reverse: a `files` list that omits the patch.
