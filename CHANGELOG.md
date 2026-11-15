# Changelog

## [0.1.2/0.1.3] - 2026-11-15

- dsh-agreement-check 0.1.3: the cordis.patch.yml and route prefix compose under the package's own name — the rename from dsh-contract-check had left the published patch stale, so installs composed as dsh-contract-check and the README's /agreement-check/api 404ed. Found by the profile-level install verification of the combined market index.
- dsh-invoice-check 0.1.2 / dsh-listing-check 0.1.2: republish wave with `engines.dsh` declared and icons shipped in-repo.
- 0.1.1 versions were gap-fills published while latest had already moved on; the dist-tags lesson is recorded in review-outbox's RELEASE-RUNBOOK.

## [0.1.0] - 2026-11-10

- Initial publication wave: three packages (agreement-check, invoice-check, listing-check), each with a main function, CLI, and host route; 18 tests covering real fixtures and exit codes.
