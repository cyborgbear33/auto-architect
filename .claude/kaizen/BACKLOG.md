# Backlog

Open improvement prospects. Shipped items are removed from here; the evidence report is the record.

The 2026-09-26 correctness pass shipped its one accepted item: [dossier lookup errors](evidence/dossier-lookup-errors-evidence.md).

The 2026-09-26 security item shipped: [API listens on localhost](evidence/api-localhost-cors-evidence.md).

## Performance

### Memory observation log re-sorts the whole history on every sample [apps/api]
Status: proposed
Problem: The default in-memory store sorts every stored batch each time a new observation is recorded. A long watch gets slower as the log grows.
Evidence: `apps/api/src/store/memory.ts` `record` pushes the batch and then `list.sort` on the full vehicle list. Timed with `tsx` against `createMemoryStore`: 500 inserts 21.8 ms, 2,000 inserts 153.2 ms, 8,000 inserts 2,159.6 ms. Seven forecast `series` walks of those 8,000 batches were 3.1 ms, so the repeated scan is not the cost. Postgres inserts one row and does not do this sort.
Expected value: Recording a long drive stays cheap instead of re-sorting thousands of samples on each new one.
Effort: low
Risk: low
Dependencies: none
Added: 2026-09-26 (kaizen-audit: Performance)

## Reliability / Stability

### Retention rewrite deletes the observation log before the kept rows are back [apps/api]
Status: proposed
Problem: On Postgres, pruning old samples deletes every observation batch for the vehicle, then inserts the kept ones one by one. If the process stops in that gap, the log is gone or only partly restored.
Evidence: `apps/api/src/store/drizzle.ts` `replaceAll` runs `db.delete` on `observationBatches` for the vehicle, then `observations.record` in a loop. There is no transaction around the two steps. `apps/api/src/services/observations.ts` `applyRetention` is the caller. The in-memory store replaces the list in one `Map.set`, so this window is the Postgres path only. Discovery history inserts the new report before it deletes older ones, so that path does not have the same hole.
Expected value: A prune either finishes or leaves the previous log intact.
Effort: low
Risk: low
Dependencies: none
Added: 2026-09-26 (kaizen-audit: Reliability / Stability)
