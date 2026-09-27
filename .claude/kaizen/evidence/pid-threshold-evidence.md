# PID threshold checks are copied in two cartridge modules

Problem
Whether a live PID meets a perception rule was implemented twice. A new comparison, or a fix to one copy, could make "the rule fired" and "the evidence says the threshold was met" disagree.

Evidence
`packages/cartridges/src/perception.ts` `evaluate` and `packages/cartridges/src/class-evidence.ts` `pidMeetsWhen` were the same four comparisons (`gt`, `gte`, `lt`, `lte`). `runPerception` used the first. `composeClassEvidence` used the second when it set `thresholdMet`.

Current Behavior
Both call `pidMeetsThreshold` in `perception.ts`. An exact bound counts as inside only for `gte` and `lte`.

Desired Outcome
One threshold function so perception and the evidence bundle cannot drift.

Options Considered
Leave the copies and add a test that they stay identical. One function is the smaller guarantee.

Recommended Change
Export `pidMeetsThreshold` from perception and use it when class evidence sets `thresholdMet`.

Architecture/Ontology Impact
None. The four comparisons are unchanged. No class or schema change.

UX Impact
None. A PID that only equals a `gt` or `lt` bound still does not count as meeting it.

Security/Privacy Impact
None.

Migration Impact
None.

Test Plan
`perception.test.ts` checks the four bounds at the exact value. `class-evidence.test.ts` checks that a long-term fuel trim equal to the lean bound is `thresholdMet: false`.

Success Metrics
Those tests pass.

Rollback Plan
Restore the private copies in `perception.ts` and `class-evidence.ts`.

Completed 2026-09-27: one threshold function. Verified by `pnpm --filter @auto/cartridges exec vitest run src/perception.test.ts src/class-evidence.test.ts` (17 passed).

Issues Encountered
none

Deviations from the Plan
none

Known Gaps
Comparing the scan before a repair with the scan after is still an open backlog item. Manufacturer maintenance intervals stay in feature research until a sourced interval table exists.
