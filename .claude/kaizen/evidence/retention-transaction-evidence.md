# Retention rewrite deletes the observation log before the kept rows are back

Problem
On Postgres, pruning old samples deleted every observation batch for the vehicle, then inserted the kept ones one by one. If the process stopped in that gap, the log was gone or only partly restored.

Evidence
`apps/api/src/store/drizzle.ts` `replaceAll` ran `db.delete` on `observationBatches` for the vehicle, then `observations.record` in a loop. There was no transaction around the two steps. `apps/api/src/services/observations.ts` `applyRetention` is the caller. The in-memory store replaces the list in one `Map.set`, so this window was the Postgres path only.

Current Behavior
`replaceAll` runs the delete and the inserts inside `db.transaction`. A failed insert rolls the delete back.

Desired Outcome
A prune either finishes or leaves the previous log intact.

Options Considered
Insert the kept rows first, then delete the ones not in the new set. A transaction around the existing delete-then-insert is the smaller change and matches the memory store's one-step replace.

Recommended Change
Share one transaction for the delete and the inserts.

Architecture/Ontology Impact
None. The store contract is unchanged.

UX Impact
None. A failed prune no longer leaves the vehicle with an empty or partial observation log.

Security/Privacy Impact
None.

Migration Impact
None. No schema change.

Test Plan
`replace-batches.test.ts` checks that a finished rewrite replaces the log in time order, and that a failed insert restores the log from before the delete. The memory conformance suite still covers `replaceAll`.

Success Metrics
Those tests pass, and `tsc --noEmit` accepts the transaction wiring.

Rollback Plan
Call `db.delete` and then `observations.record` again, outside a transaction.

Completed 2026-09-26: Postgres `replaceAll` commits the delete and the inserts together. Verified by `pnpm --filter @auto/api exec vitest run src/store/replace-batches.test.ts src/store/store.test.ts src/services/observations.test.ts` (23 passed, 1 skipped) and `tsc --noEmit`.

Issues Encountered
none

Deviations from the Plan
The rollback is tested with a stand-in transaction, because the Postgres conformance suite runs only when `DATABASE_URL` is set.

Known Gaps
The memory observation log still re-sorts the whole history on every sample. Discovery history was already insert-then-delete and was left as it was.
