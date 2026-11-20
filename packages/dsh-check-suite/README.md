# dsh-check-suite

One install for 27 document and delivery checks. Each check mounts its own endpoint
under `/<check>/api` and reports findings with line numbers.

Installing 27 packages one at a time is 27 install commands and 27 confirmations.
This bundle inserts all of them in a single row set, so a profile can turn the whole
set on or off at once.

## What it installs

| Group | Checks |
| --- | --- |
| Commit and PR | `dsh-commit-msg-check`, `dsh-pr-description-check` |
| Release and decision records | `dsh-release-notes-check`, `dsh-adr-check`, `dsh-spec-doc-check` |
| Operations | `dsh-ops-runbook-check`, `dsh-incident-report-check`, `dsh-handover-check` |
| Money and paperwork | `dsh-invoice-check`, `dsh-expense-claim-check`, `dsh-agreement-check` |
| People documents | `dsh-resume-check`, `dsh-listing-check`, `dsh-meeting-notes-check` |
| Reports | `dsh-weekly-report-check`, `dsh-test-report-check`, `dsh-bug-report-check` |
| Code and config | `dsh-dockerfile-check`, `dsh-env-example-check`, `dsh-api-doc-check`, `dsh-license-check`, `dsh-onboarding-check` |
| Verification kit | `dsh-tablelint`, `dsh-outline-lint`, `dsh-numberlint`, `dsh-citelint`, `dsh-hashcheck` |

27 in total. Each row id is `check-<slug>`, deliberately different from the id in the
package's own patch (`<slug>-check`), so installing a single check alongside the suite
does not produce a duplicate Loader id.

## Requirements

- DSH `>=0.2.2-rc.1 <0.3.0-0` and Node `>=22.19.0`.
- The web server bound to loopback. These endpoints carry no access check, so do not
  expose the port.

Installing takes about 5 minutes, most of it npm resolving 27 packages.

## Install

```
dsh plugin add dsh-check-suite
```

## Getting help

Open an issue at <https://github.com/zjukop3/dsh-vertical-kit/issues> with the check
name, the request you sent and the response you got. A finding you believe is wrong is
a bug report about a rule, and each package's README names its rule ids.

Removing the bundle removes the 27 rows; the packages stay in the profile until they
are uninstalled.

## Verify

Each check answers on its own prefix, for example:

```
curl -sS -X POST http://127.0.0.1:3080/commit-msg-check/api -d '{"text":"fix: thing."}'
```

The response carries findings with rule ids and line numbers. Exit status and payload
shape are per package; see each package's README.

## Limitations

- The endpoints are registered without a DSH access check. A page open in your browser
  can call them on the loopback interface. Do not bind the web server to a public
  interface with this bundle installed.
- The suite carries no runtime code: it only inserts rows. If one member fails to
  activate, the rest still mount, so read the plugin list rather than assuming all 27
  came up.
- Versions are pinned to `^` of the members at build time. `node scripts/sync-suite.mjs`
  regenerates the rows and the dependency set from the workspace, and
  `--check` fails when the checked-in files drift from it.

## License

MIT.