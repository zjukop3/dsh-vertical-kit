# Plugin catalog entry check

Check an [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
entry before submitting it: filename, `name`/`url` agreement, the subpackage path, one of
the 23 categories, a bilingual description, the icon, and the aggregation-bundle hint.

## What it does

Sixteen rules, all taken from the catalog's own `contributing.md`, all decidable from the
entry file alone: no network, no access to your repository, no model calls.

The catalog's CI reports "the shape is wrong". This reports which line, before you open
the pull request — which matters because most rejections are mechanical: a filename that
does not match the monorepo path, a `name` pointing at a different repository than the
`url`, `#sub` not matching the last segment of the path, a category that does not exist,
an English description with no Chinese one.

## How to use it

```
npx dsh-plugin-entry-check data/plugins/owner__repo--packages-my-plugin.yml
```

Installed into DSH it also answers at `POST /plugin-entry-check/api` with
`{"text": "..."}` or `{"path": "..."}`. The route and the CLI call the same function, so
a finding cannot appear in one and not the other.

## What it returns

Findings carry the rule, the line and a sentence naming what to write instead:

```
error sub-path 第0行 name 里的 #my-plugin 与 url 最后一段子目录 other-dir 不一致
warn filename 第0行 文件名应为 owner__repo--packages-my-plugin.yml（当前 owner__repo.yml）
```

Exit codes: 0 clean, 1 errors, 2 usage. Warnings never block.

## Calibration

The five files in `fixtures/` are real entries: four merged into the catalog and one of
mine pending review. They must produce zero findings, and the suite fails if they stop
doing so. My first version produced four false positives on them — a nested
`description:` read as missing, `#sub` compared against the whole path, a legitimate
`<name>` in prose read as a placeholder, and Chinese compared against English by
character count. All four measured the spelling I expected rather than the shape the
catalog actually accepts.

## Limitations

- It cannot read your repository: `dsh.bundle`, repository age and whether the code is
  real are the reviewers' calls.
- Rule #7 (no aggregation bundles) can only be hinted at, from the description.
- The YAML it accepts is deliberately narrow — flat keys plus one `description:` level.
  Lists, block scalars and deeper nesting are refused with a message rather than parsed
  approximately.
