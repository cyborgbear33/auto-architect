# Root test command uses each package's Vitest config

Problem
`pnpm test` ran Vitest from the repo root. The web UI's jsdom setup lives in `apps/web-ui/vitest.config.ts`, so those tests ran in Node and failed with `document is not defined`. CI and the testing guide already use `pnpm -r test`, which does not hit that script.

Evidence
Root `package.json` had `"test": "vitest run"`. The workspace file lists `apps/*` and `packages/*` only, so the root script is what `pnpm test` runs. A root Vitest run failed `functions-page.test.tsx` and `dashboard-page.test.tsx` with `document is not defined` and `window is not defined`.

Current Behavior
`pnpm test` runs `pnpm -r test`. `pnpm test:watch` runs Vitest inside each package. The testing guide and README say `pnpm test` is that same recursive command.

Desired Outcome
The obvious test command passes the UI tests instead of failing them for a missing browser environment.

Options Considered
A root Vitest workspace file could load each package config in one process. The recursive command is already what CI runs, so a second runner was not added.

Recommended Change
Point the root `test` and `test:watch` scripts at the package scripts.

Architecture/Ontology Impact
None.

UX Impact
None for the operator. This is how tests are started.

Security/Privacy Impact
None.

Migration Impact
None.

Test Plan
Run `pnpm test` and confirm it completes through the package suite, including the web UI.

Success Metrics
`pnpm test` exits 0.

Rollback Plan
Restore `"test": "vitest run"` and `"test:watch": "vitest"` in the root `package.json`.

Completed 2026-09-27: Root `pnpm test` delegates to `pnpm -r test`. Verified by `pnpm test` (exit 0), including the web UI suite at 60 passed. The same UI files had failed from the repo root with `document is not defined`.

Issues Encountered
none

Deviations from the Plan
none

Known Gaps
`pnpm test:watch` starts one Vitest watcher per package. That is usable, and it is not a single combined watch session.
