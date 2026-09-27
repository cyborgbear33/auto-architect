# Feature Research

Ideas from comparable products. An idea moves to `.claude/kaizen/BACKLOG.md` only when it has concrete evidence and a benefit worth the effort. This file is not the product backlog — that stays `docs/FUTURE_FEATURES.md`.

## App Profile

auto-architect is a single-operator garage console for one vehicle at a time. It ingests OBD-II evidence, and a formal engine proves which fault class that evidence supports. The operator gets the next justified step, a case, and a record of what was tried and what verified. Ontology owns meaning. The UI and the adapter do not classify codes. Empty evidence is not healthy. Mode 01–07 and guided external procedures are the default. Bidirectional control, flashing, and invented CAN maps stay out until an explicit project. History may cite a fix only when this garage logged it and a later check confirmed it. Likelihood stays an ordinal band, not a percent chance of failure.

Last refreshed: 2026-09-27, derived from: `docs/AI_HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/FUTURE_FEATURES.md`

## Products scanned

| Product | Category | Last scanned | Takeaway |
| --- | --- | --- | --- |
| Innova RepairSolutions 2 | Consumer OBD app plus a repair-information service | 2026-09-27 | It saves scans and shows the one from before a repair next to the one after. Most of its other headlines (national fix odds, parts store, warranty) do not fit this console. |

## Tier 1 — strong fit

### Compare the scan before a repair with the scan after [apps/web-ui]
Seen in: Innova RepairSolutions 2, which saves scans and lets the operator view them pre- and post-repair.
Opportunity: After a verify drive, this console lists the new batches and the case timeline, but it does not put the opening scan beside the later one and say which codes and readings changed.
Evidence: Innova’s app page says “Easily view scans pre & post repair” (https://www.innova.com/pages/repairsolutions2-app). This repo has observation batches, drive sessions, and verify-after-repair, and no pre/post comparison in the UI or API.
Fit note: The comparison is stored evidence, not a new fault class. It matches the rule that a claim shows why.
Added: 2026-09-27 (kaizen-research: scanning Innova RepairSolutions 2)

## Tier 2 — plausible, needs scoping

### Manufacturer maintenance intervals by mileage [packages/ontology]
Seen in: Innova RepairSolutions 2, “Upcoming Maintenance” — the maker’s recommended intervals, from the help article https://help.repairsolutions.com/article/2295-about-repairsolutions2.
Opportunity: The Silverado notes name the owner’s-manual maintenance sections and do not carry the interval mileages. The console has no maintenance schedule.
Evidence: `docs/Ontology_of_2003_Chevrolet_Silverado_2500HD_Truck_Pretty_Print.md` marks that structure document-only. No app route lists a service interval.
Fit note: Useful next to the dossier, but only with a sourced interval table. Guessed miles would violate the same rule as guessed specifications.
Added: 2026-09-27 (kaizen-research: scanning Innova RepairSolutions 2)

## Tier 3 — speculative, noted only

### Twelve-month repair probability [apps/web-ui]
Seen in: Innova RepairSolutions 2, “Predicted Repairs” — a statistical probability of repairs in the next 12 months, from the same help article.
Opportunity: A percent chance of a future repair.
Evidence: The cascade design note in `docs/FUTURE_FEATURES.md` already refuses a percent chance of failure until outcome history can back it. The shipped watchlist uses ordinal bands.
Fit note: Conflicts with that decision. Not a candidate until the decision changes.
Added: 2026-09-27 (kaizen-research: scanning Innova RepairSolutions 2)

### A national database of verified fixes as the diagnosis [apps/api]
Seen in: Innova RepairSolutions 2, ASE-technician verified fixes for the retrieved codes, from the same help article.
Opportunity: Tell the operator the usual fix for this code from other people’s cars.
Evidence: This garage already shows “what worked” from its own verified solution history (`DtcWhatWorkedChips`). `docs/FUTURE_FEATURES.md` says history never invents a fix that was not logged and verified here.
Fit note: A national prior would assert a repair this vehicle has not confirmed. Local history stays the record.
Added: 2026-09-27 (kaizen-research: scanning Innova RepairSolutions 2)

## Research log

| Date | Product scanned | Method | Found | Tiered | Promoted to backlog | Rejected (reasons) |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-27 | Innova RepairSolutions 2 | Web search and the Innova app page plus the RepairSolutions help article, cross-checked against `docs/FUTURE_FEATURES.md` and the code | 8 | 4 (1 / 1 / 2) | 1 (pre/post scan comparison) | 4 (TSBs and recalls already have a campaigns page; live recordings are drive sessions; DTC wording is the dictionary and narration; an oil/battery/brake/TPMS “health” tile would treat missing enhanced data as a status) |
