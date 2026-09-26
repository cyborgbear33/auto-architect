# Memory observation log re-sorts the whole history on every sample

Problem
The default in-memory store sorted every stored batch each time a new observation was recorded. A long watch got slower as the log grew.

Evidence
`apps/api/src/store/memory.ts` `record` pushed the batch and then `list.sort` on the full vehicle list. Timed with `tsx` against `createMemoryStore`: 500 inserts 21.8 ms, 2,000 inserts 153.2 ms, 8,000 inserts 2,159.6 ms. Seven forecast `series` walks of those 8,000 batches were 3.1 ms, so the repeated scan was not the cost. Postgres inserts one row and does not do this sort.

Current Behavior
An in-order sample is appended. An older sample is inserted at its timestamp with a binary search. Equal timestamps stay in arrival order.

Desired Outcome
Recording a long drive stays cheap instead of re-sorting thousands of samples on each new one.

Options Considered
Keep a side index and sort only when listing. The list is already the index, and live samples arrive in order, so appending is enough for the common path.

Recommended Change
Append when the new timestamp is at or after the last batch. Otherwise insert it in order.

Architecture/Ontology Impact
None. The store contract is unchanged.

UX Impact
None. A long live watch no longer spends its time re-sorting the log on every sample.

Security/Privacy Impact
None.

Migration Impact
None.

Test Plan
The store conformance suite records an older sample after a newer one and expects time order. `memory-record.test.ts` records 200 in-order samples and one equal timestamp, and expects the equal sample to follow the earlier one with the same time.

Success Metrics
Those tests pass.

Rollback Plan
Push the batch and `list.sort` by `capturedAt` again.

Completed 2026-09-26: in-order samples append. Verified by `pnpm --filter @auto/api exec vitest run src/store/memory-record.test.ts src/store/store.test.ts` (13 passed, 1 skipped).

Issues Encountered
none

Deviations from the Plan
none

Known Gaps
Reading the log still walks it from the start. That walk measured 3.1 ms at 8,000 batches and was left as it was. `replaceAll` still sorts once, which is the retention rewrite, not the per-sample path.
