# Choose which two scans to compare

Problem
Diagnosis always compared the oldest saved snapshot with the newest. After a few watches, that pair is often not the scan from before a repair and the scan from after it.

Evidence
The scan-comparison evidence report named this as the remaining gap. A drive session is already one snapshot, so three occasions are three choices, and only the ends were used.

Current Behavior
With two snapshots, Diagnosis still compares those two and does not show a picker. With three or more, the operator picks the earlier scan and the later scan. Each option shows the time and whether the sample came from the live adapter, a simulation, a manual entry, or an imported file. The default pair is still the oldest and the newest. A missing code is not called gone.

Desired Outcome
The operator can set the comparison on the two occasions that bracket the work.

Options Considered
Keep oldest-versus-newest only. That stays wrong once a third scan exists. Comparing every sample inside one watch was already rejected, because a drive is not a repair.

Recommended Change
Two selects on the Diagnosis comparison, backed by the same snapshot list. The earlier choice cannot be the later choice.

Architecture/Ontology Impact
None. The panel does not prove or clear a fault class.

UX Impact
The picker appears only when there is a real choice. Two scans keep the previous sentence. The Guide diagnosis line says a missing code is not proof it is gone.

Security/Privacy Impact
None.

Migration Impact
None.

Test Plan
`clampScanPair` refuses a reversed pair. The diagnosis page test loads three scans, checks that the default pair is the oldest against the newest, then chooses the middle scan and checks that the oldest code drops out.

Success Metrics
Those tests pass.

Rollback Plan
Remove the selects and call `compareScans` again.

Completed 2026-09-27: Diagnosis lets the operator pick the earlier and later snapshot when more than two exist. Verified by `pnpm --filter @auto/web-ui exec vitest run src/lib/scan-compare.test.ts src/__tests__/diagnosis-page.test.tsx` (16 passed). The live page was not clicked: the browser tools were not available in this session, port 4100 was already another process, and a temporary UI was stopped after the tests.

Issues Encountered
none

Deviations from the Plan
The panel remounts when the selected vehicle changes, so the pair resets to oldest and newest.

Known Gaps
The two selects are the whole history of snapshots, not a search. Manufacturer maintenance intervals remain in feature research until a sourced interval table exists.
