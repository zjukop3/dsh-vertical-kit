# Check suite

27 document and delivery checks in one bundle.

## What it does

Each member package is an independent Host plugin: it injects `webServer` and
registers a prefix route at `/<check>/api`. The suite adds no code of its own. Its
`cordis.patch.yml` inserts one row per member, so a single `dsh plugin add
dsh-check-suite` mounts all 27 route prefixes in the profile.

Row ids are `check-<slug>`, which differs from the id each package uses when it is
installed on its own (`<slug>-check`). Installing one check beside the suite therefore
adds a second, independently named row instead of colliding with an existing one.

## How to use it

Install the bundle, then call any check's prefix. Two examples:

```
curl -sS -X POST http://127.0.0.1:3080/commit-msg-check/api \
  -H 'content-type: application/json' \
  -d '{"text":"feat: add the thing."}'

curl -sS -X POST http://127.0.0.1:3080/hashcheck/api \
  -H 'content-type: application/json' \
  -d '{"root":"/path/to/deliverable"}'
```

Every response is a findings list; each finding names a rule id and, where the
document has lines, the line it came from. Per-package request and response shapes are
documented in that package's README.

To take one check out without removing the whole suite, disable its row in the
profile's own patch layer rather than uninstalling the bundle.

## What it does not do

- **No access control on the routes.** They are registered without a DSH access
  check, so any page open in the browser can reach them over the loopback interface.
  Keep the web server bound to loopback while this bundle is installed.
- **No all-or-nothing activation.** A member that fails to activate does not stop the
  others; check the plugin list if a prefix does not answer.
- **No version range discovery.** Dependencies are pinned to `^` of the member
  versions at build time. Rebuild with `node scripts/sync-suite.mjs` after bumping a
  member, and CI runs `--check` so the checked-in patch cannot drift from the
  workspace.
- **Not a linter runner.** It does not walk a directory and decide what to check;
  each endpoint takes the text or paths the caller hands it.

## Verification

`node scripts/sync-suite.mjs --check` must print that the suite matches the workspace,
and `test/suite.test.js` asserts the row count, id uniqueness against every member's
own patch id, dependency versions against the workspace, and that the packed file list
contains the patch, locales, detail document and icon.

## License

MIT.