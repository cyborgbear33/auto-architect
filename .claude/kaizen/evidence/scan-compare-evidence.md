# Compare the scan before a repair with the scan after

Problem
After a verify drive, the console stored the new batches and the case timeline, but it did not set the opening scan next to the later one and show which codes and readings changed.

Evidence
Innova RepairSolutions 2 saves scans and tells the operator to view them pre- and post-repair (https://www.innova.com/pages/repairsolutions2-app). This repo had observation batches, drive sessions, and verify-after-repair, and no pre/post comparison.

Current Behavior
Diagnosis shows "What changed between scans" when two snapshots exist. A drive session counts as one snapshot, its last sample. The panel lists codes still on both scans, status changes, codes missing from the later scan, codes only on the later scan, and readings that differ. A missing code is not called gone. Two scans with no codes are not called healthy.

Desired Outcome
The operator can see what the repair changed, from the two scans already on file, without treating a missing code as proof the vehicle is healthy.

Options Considered
Compare every sample in a watch. That would treat a drive as a repair. One snapshot per session keeps the comparison to separate occasions.

Recommended Change
Compare the oldest snapshot with the newest on Diagnosis, from the batches already stored.

Architecture/Ontology Impact
None. The panel does not prove or clear a fault class.

UX Impact
The comparison appears on Diagnosis only when two snapshots exist. A failed batch request says the scans could not be loaded.

Security/Privacy Impact
None.

Migration Impact
None.

Test Plan
`scan-compare.test.ts` checks that one session does not compare, that two sessions use each session's last sample, and that a status change stays distinct from a code that remained. `diagnosis-page.test.tsx` checks the panel copy, the missing-code hold, and a failed load.

Success Metrics
Those tests pass.

Rollback Plan
Remove `ScanComparePanel` from Diagnosis.

Completed 2026-09-27: Diagnosis compares the oldest saved snapshot with the newest. Verified by `pnpm --filter @auto/web-ui exec vitest run src/lib/scan-compare.test.ts src/__tests__/diagnosis-page.test.tsx` (13 passed). The live page was not opened in a browser; the API was not running.

Issues Encountered
none

Deviations from the Plan
A single drive session is one snapshot, so the panel stays hidden until a second occasion is on file.

Known Gaps
The panel always uses the oldest snapshot and the newest. It does not let the operator pick two sessions. Manufacturer maintenance intervals remain in feature research until a sourced interval table exists.
