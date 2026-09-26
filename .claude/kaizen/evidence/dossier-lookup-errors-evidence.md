# Dossier lookup errors

Problem
A failed campaigns load on Diagnosis was shown as "No campaigns matched this engine family." A discovery load that failed for a reason other than "not run" stayed on "Discovery…".

Evidence
`apps/web-ui/src/components/VehicleDossierStrip.tsx` treated `campaignsQ.data` missing as a zero count, and any non-404 discovery state without data as still loading.

Current Behavior
A 500 from campaigns now says "Campaigns could not be loaded." A non-404 discovery failure says "Discovery could not be loaded." A 404 still links to Discovery. An empty successful campaign list still says nothing matched.

Desired Outcome
A failed lookup is not described as a clean no-match or as a load still in progress.

Options Considered
Leave the copy and only log the failure. Rejected: the operator would still read a false result.

Recommended Change
Branch the dossier copy on `isError` before the empty-count and still-loading sentences.

Architecture/Ontology Impact
None. Copy only. Ontology meaning is unchanged.

UX Impact
Diagnosis dossier tells the truth when those two requests fail.

Security/Privacy Impact
None.

Migration Impact
None.

Test Plan
`diagnosis-page.test.tsx` rejects both requests with 500 and expects the two failure sentences, and expects the no-match sentence to stay absent.

Success Metrics
The 500 test passes, and the existing 404 "Discovery not run" test still passes.

Rollback Plan
Revert the dossier branches and the new test.

Completed 2026-09-26: the dossier branches on query error. Verified by `pnpm --filter @auto/web-ui exec vitest run src/__tests__/diagnosis-page.test.tsx` (8 passed).

Issues Encountered
none

Deviations from the Plan
none

Known Gaps
Other panels can still show an empty list when their request fails. This pass only covered the Diagnosis dossier. The recommendation query-key suspicion was checked and dropped: both callers ask for open recommendations.
