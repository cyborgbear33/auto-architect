# Backlog

Open improvement prospects. Shipped items are removed from here; the evidence report is the record.

The 2026-09-26 correctness pass shipped its one accepted item: [dossier lookup errors](evidence/dossier-lookup-errors-evidence.md).

The 2026-09-26 security item shipped: [API listens on localhost](evidence/api-localhost-cors-evidence.md).

The 2026-09-26 reliability item shipped: [retention rewrite](evidence/retention-transaction-evidence.md).

The 2026-09-26 performance item shipped: [memory log insert](evidence/memory-log-insert-evidence.md).

No open entries.

## Maintainability / Code Quality

### PID threshold checks are copied in two cartridge modules [packages/cartridges]
Status: proposed
Problem: Whether a live PID meets a perception rule is implemented twice. A new comparison, or a fix to one copy, can make "the rule fired" and "the evidence says the threshold was met" disagree.
Evidence: `packages/cartridges/src/perception.ts` `evaluate` (lines 11–17) and `packages/cartridges/src/class-evidence.ts` `pidMeetsWhen` (lines 26–35) are the same four comparisons (`gt`, `gte`, `lt`, `lte`). `runPerception` uses the first. `composeClassEvidence` uses the second when it sets `thresholdMet`.
Expected value: One threshold function so perception and the evidence bundle cannot drift.
Effort: low
Risk: low
Dependencies: none
Added: 2026-09-27 (kaizen-audit: Maintainability / Code Quality)

## Feature research

### Compare the scan before a repair with the scan after [apps/web-ui]
Status: proposed
Problem: After a verify drive, the console stores the new batches and the case timeline, but it does not set the opening scan next to the later one and show which codes and readings changed.
Evidence: Innova RepairSolutions 2 saves scans and tells the operator to view them pre- and post-repair (https://www.innova.com/pages/repairsolutions2-app). This repo has observation batches, drive sessions, and verify-after-repair. A search of the UI and API finds no pre/post comparison.
Expected value: The operator can see what the repair changed, from the two scans already on file, without treating a missing code as proof the vehicle is healthy.
Effort: medium
Risk: low
Dependencies: none
Added: 2026-09-27 (kaizen-research: Innova RepairSolutions 2)
