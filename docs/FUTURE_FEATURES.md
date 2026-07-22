# FUTURE_FEATURES.md

This is the canonical **future-feature backlog** for `auto-architect`.
Use it when selecting new work. Keep it current as features are planned and delivered.

## How to use this file

- Use this document as the first stop when asking "what should we build next?"
- Start from **Product goals** (summary), then read **Ideal solutions by goal**
  for strategy and work pieces before picking backlog rows.
- Add new candidate features here as they are discovered.
- Keep each feature scoped as a capability, not a task list.
- Link implemented features to the docs that now describe them.

## Maintenance rules (required)

When implementing a feature:

1. Move it from **Planned Backlog** to **Implemented History**.
2. Update the matching row in **Product goals** (status + "done when").
3. Tick or revise the relevant **work pieces** under Ideal solutions when a
   slice ships (do not delete strategy text — mark pieces done).
4. Add:
   - implementation PR/commit reference (if available),
   - primary guide/docs path,
   - brief note on where it lives in code.
5. If a feature is fully shipped and documented elsewhere, remove it from Planned Backlog.

When proposing a new feature:

1. Prefer attaching it to a **work piece** under Ideal solutions, then add a
   Planned Backlog row that points at that piece.
2. Include the likely system seams it reuses (ontology, bridge, solver, cartridges, obd-gateway, etc.).
3. Keep prioritization honest: update priority and status fields, do not leave stale entries.

---

## Product goals (why this app exists)

These are the major reasons for the product. Status is relative to a **complete
single-operator garage** tool — not “does any code exist.” Ideal shape and
multi-piece plans live in the next section.

| Goal | Status | What exists today | Done when | Closing backlog |
|---|---|---|---|---|
| **Scanning** — ingest OBD evidence | **partial** | Simulate/API ingest; live gauge strip + FF/Mode06 UI; source labels | Live MX+ path proven; drive sessions; retention policy | Live MX+ dry-run (S1 hardware); GatewayScanCommands UI done |
| **Analysis** — prove fault classes from evidence | **partial** | Recognition + narration + evidence; ~134 P0xxx circuit/emission seed | Full J1979/J2012 catalog + teaching-grade cause briefs | A4/S7; **A6–A7** causal model + apprentice brief |
| **Diagnosis (probabilistic)** — ranked next steps under uncertainty | **partial** | Outcome shrink-calibration; counterfactuals + disqualified UI | Ranked steps *and* understandable differentials | **A6–A7**, X6; D5 LLM only after structured causes |
| **Informing the user** — clear operator / apprentice surfaces | **partial** | Source badges, narration, AEMF, calibration chips, empty-evidence honesty | Apprentice can explain vehicle + problem + fix from the UI | **A7**, I7, V1; I5 package |
| **Recommendations** — what to do next | **partial** | Class + campaign cards; accept/dismiss/convert | Deeper campaign→repair playbooks tied into briefs | R6 → A7; RecommendationService |
| **Problem tracking** — open cases through solve | **shipped** | Caseboard filters; abandon/escalate/reopen; `worked` → verifying → verify check | — | — |
| **Problem history** — cases over time | **partial** | Case timeline + filters + evidence/session deep-links | Stronger batch-level evidence anchors | Durable observation history |
| **Solution history** — what fixed what, confirmed over time | **partial** | Rollup + panel + sample-size UX (F10); verify-before-solved | Live multi-vehicle priors polish | Multi-signal trends |
| **History → better future decisions** | **partial** | Trends + calibration + LearningCycle + knowledge-gap queue (F9–F11) | Live evidence fuel (S1); optional LLM advise | Live MX+; optional LLM advise |
| **Reporting** — shareable diagnostic note | **partial** | Markdown + garage JSON/CSV export/import; Learning section | Print/PDF polish | Print-friendly HTML/PDF |

**Spine that already works:** ingest → realize → draft/solve → recommend → policy hold → log-repair → verify → Journal.  
**Not yet a complete garage product:** live scan UX reliability, second-vehicle OEM depth, richer AEMF framing.

### North star — “You are the vehicle”

Learn everything lawfully available from OBD-II / CAN (and guided enhanced
sessions when scoped): be informed, recommend, decide, enact (or guide)
actions, and remember outcomes for sure reference. The operator experiences a
principled companion that models the vehicle’s state — never invents meaning
outside propose/dispose.

**Ontological learning tactic — AEMF (Air / Electricity / Mechanical / Fluid):**
every fault class, recommendation, and playbook should be situable in one or
more of these media. Delivery and ranking stay evidence-backed; AEMF is framing
for comprehension and playbook selection, not a second classifier.

| Aspect | Typical OBD/CAN signals | Example classes |
|---|---|---|
| **Air** | MAF/MAP, O2, fuel trim, EVAP, EGR, secondary air | Lean/Rich, Evap*, Catalyst*, O2*, Egr*, SecondaryAir* |
| **Electricity** | Circuit DTCs, coil/injector/sensor circuits, heaters | *CircuitFault, IgnitionCoil*, Injector*, Knock*, TPS*, O2Heater* |
| **Mechanical** | Misfire under load, cam/crank correlation, VVT Mode 06 | MisfireUnderLoad, CamCrankCorrelationFault |
| **Fluid** | Oil trends, coolant/thermostat, MultiAir oil starvation | ChronicOilConsumption, Coolant*, MultiAirOilStarvation |

**Integrity boundary for actuation:** Mode 01–07 + guided external procedures
remain the default. Bi-directional UDS / flashing stay out of scope until an
explicit enhanced-session project — memory and recommendations must still work.

**Apprentice diagnoser tactic — teach, don’t just rank:**
The operator (and future apprentice) should leave each case understanding
(1) the vehicle identity and systems in play, (2) what evidence proved which
fault class, (3) *why* that class tends to happen (causes / differentials),
(4) what to try next and how history on *this* vehicle informs it, and
(5) what “fixed” meant last time. Ranking without teaching is incomplete.
`CausalModel` on `DiagnosticProblem` exists but is unused — fill it from
cartridges + evidence (propose); LOGOS still disposes membership.

**Cross-cutting product strategy (applies to every goal):**

1. **Propose / dispose stays sacred** — heuristics and LLMs may suggest; LOGOS
   proves class membership, policy, and ranked actions. Never let UI or gateway
   invent fault meaning.
2. **Evidence adjacent to every claim** — if the operator cannot see *why*, the
   claim is incomplete (`UX_GUIDELINES`).
3. **One garage, durable facts** — Postgres is the production store; memory is
   for tests/demo only when validating logic.
4. **Ship thin vertical slices** — each work piece below should be deliverable
   alone and still leave the spine green.
5. **Prefer reuse over new surfaces** — extend Dashboard / Diagnosis / Journal /
   ProblemDetail before inventing nav items.
6. **AEMF framing** — prefer situating proven classes and recommendations in
   air/electricity/mechanical/fluid without inventing membership.
7. **Teach the differential** — every proven class should eventually carry a
   causal brief (symptoms → possible causes → what evidence supports now →
   what to prove next), composed from ontology + live data + this vehicle’s
   history — never from invented realize membership.
8. **Continuous improvement** — discover → log here → build by value/priority
   (integrity → causal teaching spine → live evidence → ontology depth → UX).

---

## Ideal solutions by goal

Each subsection: **ideal product**, **strategy**, **work pieces** (build order
roughly top→bottom), **seams**, **anti-patterns**. Status tags on pieces:
`[done]` / `[partial]` / `[todo]`.

### 1. Scanning — ingest OBD evidence

**Ideal product.** Connecting the adapter feels boringly reliable. One button
(or CLI) runs a structured scan; optional watch records a *drive session*. DTCs,
PIDs, freeze-frames, and Mode 06 land in durable storage with source
(`obd_gateway` | `simulated` | `manual_entry`), timestamps, and odometer.
Dashboard shows freshness. The operator never wonders whether they are looking
at live bus data or a simulation.

**Strategy.** Treat scanning as a **pipeline**, not a page: edge capture →
validated batch → store → freshness UI. Prove hardware early (MX+ dry-run)
before investing in polish. Prefer session grouping over dumping raw batches
into the Journal forever.

| # | Work piece | Status | Notes |
|---|---|---|---|
| S1 | Validated live MX+ dry-run on Jeep (scan + watch → Dashboard) | partial | Dashboard copyable gateway commands shipped; hardware validation still operator checklist |
| S2 | Live gauge strip (RPM, load, fuel trim, coolant) + stale indicators | done | `GET .../live-gauges`, `LiveGaugeStrip` |
| S3 | Mode 06 + freeze-frame capture already in batches → **surface in UI** | done | Edge `read_freeze_frames` / `read_mode06` + `EvidencePanels` |
| S4 | DriveSession object (start/stop; batches linked by `sessionId`) | done | `DriveSessionService`; simulate path; Dashboard panel |
| S5 | Retention policy (keep FF/Mode06 forever; downsample high-rate PIDs) | done | `applyRetention` / prune; keep evidence; hourly PID downsample |
| S6 | Bluetooth / preferred-adapter discovery | todo | Friction reduction after S1 works manually |
| S7 | SAE PID/DTC dictionary depth for scan interpretation | partial | ~134 P0xxx + coil/MAP/knock/injector/TPS; still not full J1979 |

**Seams:** `apps/obd-gateway`, `ObservationsService`, store batches, Dashboard.  
**Anti-patterns:** Classifying faults in the gateway; silent simulate-vs-live;
building a “scan dashboard” that bypasses `POST .../observations`.

---

### 2. Analysis — prove fault classes from evidence

**Ideal product.** Recognition answers: *which fault classes are proven from
current evidence?* Each proven class shows supporting DTCs/PIDs/freeze-frame/
Mode 06 and a short plain-English proof **plus a teaching-grade causal brief**
(why this happens, differentials, what to prove next). Undecided / not-proven
stays visible — the system never invents “Healthy.” Cartridge coverage grows
with the SAE KB and engine-family views, not with ad-hoc UI strings.

**Strategy.** Keep **perceive → realize** as the only path to class membership.
Invest in *explanation, causal structure, and evidence adjacency*, not
alternate classifiers. Expand dictionaries and ontology views so perception
has more lawful fuel. Populate `CausalModel` from cartridge catalogs + current
`classEvidence` (propose); compose apprentice briefs from that + AEMF + history.

| # | Work piece | Status | Notes |
|---|---|---|---|
| A1 | Evidence panel per `mostSpecific` class | done | `Recognition.classEvidence` + `ClassEvidencePanel` (no Mode 06 in v1) |
| A2 | Wire `verbalize` into Recognition API + Diagnosis UI | done | `Recognition.narration` + ontology-note fallback |
| A3 | Mode 06 as recognition input where ontology allows | done | Thin SAE/ISO OBDMID seed → perception → realize; unknown MIDs unlabeled |
| A4 | Broader curated DTC/PID KB + ontology lint parity | partial | + coil/injector/MAP/knock/TPS circuit families; still not full J2012 |
| A5 | Engine-family cartridge depth (MultiAir real; EcoTec3 when truck exists) | partial | SAE set shared; GM stub inert until real truck |
| A6 | Populate `CausalModel` on draft/solve from cartridge cause catalogs + live `classEvidence` | planned | Symptoms / possibleCauses / mostLikelyCauses; never invents realize membership |
| A7 | Apprentice **causal brief** read-model + Diagnosis/ProblemDetail panel | planned | Compose evidence + ontology/AEMF + WhatWorked/LearningCycle → why / how we know / prove next |

**Seams:** cartridges, `RecognitionService`, logos-bridge `realize`/`verbalize`,
dictionaries, Diagnosis/Dashboard, `CausalModel`, solution-history.  
**Anti-patterns:** UI-only “likely misfire” badges; LLM classifying without
realize; hiding undecided membership; causal prose that invents class membership.

---

### 3. Diagnosis (probabilistic) — ranked next steps under uncertainty

**Ideal product.** A diagnostic case is a first-class `DiagnosticProblem` with
clear current/desired state **and a filled causal model the apprentice can
read**. `solve` returns ranked actions with honest uncertainty: solver scores
*plus* priors from this vehicle’s (and optionally engine-family) confirmed
outcomes. Policy can forbid unsafe shortcuts (e.g. clear-codes under oil
starvation). Counterfactuals explain “why not #1.” Differentials explain
“why coil before injector.” Probability language is calibrated — never fake
precision.

**Strategy.** Today’s solve is **scoring under constraints**, not Bayesian
posteriors. Do not pretend otherwise. Close the loop:
`log-repair` outcomes → empirical priors → adjust playbook confidence / solve
inputs → re-rank. Keep policy defeasible and fail-closed. Prefer **A6/A7
structured causes** before optional LLM; LLM may *propose* framing or
candidate causes/actions against that structure; LOGOS still disposes.

| # | Work piece | Status | Notes |
|---|---|---|---|
| D1 | Draft/solve + policy holds (MVP path) | done | ActionService + PolicyService |
| D2 | Surface counterfactuals / disqualified actions in UI | done | `Explainability.tsx` on ProblemDetail; FakeLogosBridge emits thin CFs |
| D3 | Outcome → playbook confidence / action priors | done | `calibration.ts` → draft/solve/refresh |
| D4 | Family-level priors (same engineFamily) with small-sample caution | done | Family buckets + higher `k` |
| D5 | Optional propose-only LLM advise pass (draft candidates / cause gloss) | planned | After A6/A7; never skip realize/reason/solve; never invent membership |

**Seams:** `ActionService`, `SolverService`, `PolicyService`, cartridges,
`ProblemOutcome` / `DecisionRecord`.  
**Anti-patterns:** Calling scores “probabilities” before calibration; soft UI
override of Forbid; solve without `desiredState.successCriteria`.

---

### 4. Informing the user — clear operator surfaces

**Ideal product.** Four intent-grouped surfaces stay primary: Operate
(Dashboard), Diagnose, Reference (campaigns), History (Journal + case timeline).
Every claim has evidence. Safety holds are loud. Sim vs live is labeled.
Shared trust primitives (status pills, empty/error, evidence panels) stop each
page inventing its own language. Internals stay behind Debug.

**Strategy.** Follow `UX_GUIDELINES`: goal-grouped nav, progressive disclosure,
evidence with claims. Prefer deepening existing pages over new top-level routes.
Ship `@auto/ui-components` once patterns repeat twice.

| # | Work piece | Status | Notes |
|---|---|---|---|
| I1 | Goal-grouped nav + vehicle switcher | done | Dashboard / Diagnosis / Campaigns / Journal |
| I2 | Evidence source labeling (sim / live / manual) everywhere data shows | done | Dashboard + Diagnosis via `GET .../evidence-provenance` |
| I3 | Live gauges + Mode 06 + freeze-frame panels | done | Gauges + FF/Mode06 on Dashboard |
| I4 | Verbalized proofs on Diagnosis / ProblemDetail | done | Narration on Dashboard/Diagnosis |
| I5 | Shared `@auto/ui-components` | partial | Thin EmptyEvidenceState in web-ui; full package later |
| I6 | Staleness / “last observation” chrome on Dashboard | done | Fresh/Stale badge on gauge strip |
| I7 | Diagnosis proven list: fluent narration primary, class id secondary | planned | Parity with UX5 Dashboard; less jargon-first for apprentices |
| V1 | Vehicle dossier strip on Diagnosis (profile + VIN/odo ritual + discovery + campaigns) | planned | Identity completeness before deep causal teaching; never invent VIN |

**Seams:** web-ui pages, `UX_GUIDELINES`, api-client queryKeys, vehicle profiles.  
**Anti-patterns:** Flat 17-item nav; theorem-prover chrome in operator mode;
claims without evidence; teaching panels that hide which vehicle they are about.

---

### 5. Recommendations — what to do next

**Ideal product.** Recommendations are the **operator-facing shortlist** derived
from proven classes (and campaigns), not a second brain. Each card shows title,
why (classes + evidence link), priority, confidence, rough cost/risk, and
status lifecycle (new → accepted → converted_to_repair / dismissed). Refresh
after new observations. History (“coil swap worked last time”) can raise
priority — but never invent a class that realize did not prove.

**Strategy.** Keep `refresh` driven by recognition. Enrich cards and feed
calibration/rollup into priority. Link recommendations to problems when a case
is opened (`generatedByProblem`).

| # | Work piece | Status | Notes |
|---|---|---|---|
| R1 | Refresh from `mostSpecific` + cartridge drafts | done | RecommendationService |
| R2 | Card richness: confidence, cost/risk, evidence deep-link | done | Playbook cost/risk on refresh; Evidence + Diagnosis links |
| R3 | Status lifecycle in UI (accept / dismiss / convert) | done | Accept/dismiss + convert→ActionService; open-only shortlist |
| R4 | History-aware priority from solution rollup + calibration | done | One-step bump when worked≥2 clean |
| R5 | Campaign-backed recommendations (TSB/recall → actionable card) | done | Refresh emits W80/W84/TSB cards; empty classes; Campaigns link |
| R6 | Campaign/TSB steps linked into A7 causal brief (“OEM also says…”) | planned | Applicability only — never invents a proven fault class |

**Seams:** `RecommendationService`, recognition, campaigns, Dashboard, A7.  
**Anti-patterns:** Recommendations that invent fault classes; burying cost/risk;
refresh that ignores policy holds for unsafe actions.

---

### 6. Problem tracking — open cases through solve

**Ideal product.** The Diagnosis page is a **caseboard**: filter by status,
urgency, vehicle; open → analyzing → solved / escalated / abandoned. From a
proven class, one click drafts a problem with good framing. Solve ranks next
steps. After a repair is logged, the case enters **verify** (watch for DTC
return / PID sanity) before it is truly closed. Reopen is first-class when the
fault returns.

**Strategy.** MVP CRUD is enough to start cases; the product leap is lifecycle
+ verify-after-repair, not more fields on `DiagnosticProblem`.

| # | Work piece | Status | Notes |
|---|---|---|---|
| P1 | Create / get / list / solve problems | done | API + Diagnosis + ProblemDetail |
| P2 | Caseboard filters + abandon / escalate UX | done | Diagnosis filters + lifecycle actions |
| P3 | Draft-from-recognition one-click | done | Hidden while an *active* case exists for the class |
| P4 | Verify-after-repair workflow (success criteria check) | done | `worked` → `verifying`; verify re-runs recognition |
| P5 | Reopen with lineage to prior case / decision | done | `reopenedFromId`; clears verification |

**Seams:** `DiagnosticProblem`, ActionService, Diagnosis UI, observations.  
**Anti-patterns:** Solving without a problem; deleting cases instead of
abandoning; “solved” with no outcome or verify step.

---

### 7. Problem history — cases over time

**Ideal product.** For each vehicle, a chronological **case timeline**: opened,
evidence snapshots, solves, decisions, outcomes, verify results, reopens —
with odometer and drive-session context. Journal remains the decision audit;
the timeline is the case narrative. Postgres retention makes this survive
restarts.

**Strategy.** Don’t overload Journal. Add timeline views on Diagnosis /
ProblemDetail fed by problems + decisions + linked sessions. Durable batches
are the evidence spine under each event.

| # | Work piece | Status | Notes |
|---|---|---|---|
| H1 | Durable problem + decision persistence | done | Postgres store |
| H2 | Case timeline UI (events from problem + decisions) | done | Durable `lifecycleEvents` + decisions; Diagnosis + ProblemDetail |
| H3 | Attach odometer / session to case events | done | Stamped on lifecycle + DecisionRecord; CaseTimelinePanel shows mi / session |
| H4 | Filter history by class, status, date, mileage | done | `CaseTimelinePanel` client filters |
| H5 | Deep link timeline event → evidence batch / freeze-frame | done | Evidence + `#session:…` → DriveSessionsPanel highlight |
| H6 | Operator-entered complaint / symptom journal → framing input | planned | Human symptoms (rough idle, smell, stall) enrich draft framing; never invent realize classes |

**Seams:** problems, decisions, DriveSession, ObservationsService, Diagnosis.  
**Anti-patterns:** Journal-as-only-history; losing evidence when a problem is
marked solved; treating complaints as proven fault classes.

---

### 8. Solution history — confirmed fixes through time

**Ideal product.** Every enacted repair is a `DecisionRecord` with optional
`ProblemOutcome`. Queries answer: *What fixed `MisfireUnderLoad` on this Jeep?
On this engine family?* Success/fail/partial rates are visible. Confirmed
solutions become the memory that calibration and recommendations read — not a
separate wiki.

**Strategy.** Write path exists (`log-repair`). Build **read models** (rollups)
before fancy ML. Require outcome status when closing a case. Prefer explicit
confirmation (“worked after 50 mi verify”) over assuming solve ≡ fixed.

| # | Work piece | Status | Notes |
|---|---|---|---|
| X1 | log-repair → DecisionRecord + ProblemOutcome | done | ActionService |
| X2 | Journal list with outcome pills | done | thin but real |
| X3 | Rollup API: by vehicle, class, engineFamily, actionId | done | `GET .../solution-history?class=` |
| X4 | “What worked before” panel on Diagnosis / ProblemDetail | done | `WhatWorkedPanel` |
| X5 | Require / encourage outcome + verify before terminal solved | done | `log-repair` worked → verifying; verify closes or reopens |
| X6 | Solution narrative cards for apprentices | planned | “Action → class → outcome → verify → why believed” — not just n= counts; feeds A7 |

**Seams:** `DecisionRecord`, `ProblemOutcome`, RecommendationsService, Journal, A7.  
**Anti-patterns:** Outcomes that never get recorded; rollups that ignore
sample size; treating dismissed recommendations as confirmed fixes.

---

### 9. History → better future decisions & recommendations

**Ideal product.** Two memory lanes feed the future:

1. **Signal memory** — PID/Mode06/DTC trends and forecasts (oil today; more
   signals later) influence recognition when ontology allows.
2. **Outcome memory** — confirmed repairs shift priors and recommendation
   priority for the next similar case.

A third lane, **cascade prognosis**, answers on command: *given what is already
proven or open, what high-confidence common failures are likely next?* It is
not a second recognition engine and not actuarial insurance math — it is a
curated, evidence-cited watchlist of next risks.

The operator sees *why* a priority moved (“worked 2/2 times on this vehicle”)
and *why* a cascade is listed (“catalyst damage risk because misfire under load
is proven + drive-cycle heat”). Small samples shrink toward cartridge defaults —
never overfit one lucky fix. Likelihood uses **ordinal bands** (`Watch` /
`Elevated` / `High`) plus cited evidence and optional time/mileage **ranges** —
not fake %-chance-of-failure until outcome data can honestly support it.

**Strategy.** Keep lanes separate. Do not let trends invent classes outside
realize. Calibration is the flagship piece; multi-signal trends expand
ForecastService carefully with ontology backing. Cascade prognosis is a
**multi-phase** feature (see Planned Backlog): start with OBD fault-class edges
seeded from the same DL/cartridge spine, then optionally add a thin
operator-entered mechanical wear layer that shares the same edge schema —
never invent pad/rotor/bearing state from Mode 01 alone.

| # | Work piece | Status | Notes |
|---|---|---|---|
| F1 | Oil-level trend → recognition evidence | done | ForecastService (narrow) |
| F2 | Outcome → confidence calibration into refresh + solve priors | done | `calibratePlaybook` |
| F3 | Multi-signal trends (fuel trim, coolant, load-at-misfire) | done | RisingFuelTrim / RecurringHighLoad → realize; coolant informing-only |
| F4 | Session-aware trends (per drive, not only global series) | done | `GET .../forecast?sessionId=`; Dashboard drive-scope picker; recognition stays global |
| F5 | Explainability chip: “priority raised because …” | done | `Recommendation.calibrationExplain` + `CalibrationExplainChip` |
| F6 | Cascade edge catalog (OBD fault-class → next-risk) in ontology/cartridges | done | `cascade-edges.json` + `listCascadeEdges` |
| F7 | On-command CascadePrognosisService + UI (ordinal bands + evidence + horizons) | done | API + Diagnosis `CascadePrognosisPanel` |
| F8 | Optional mechanical wear layer (operator-entered stages) on same edge schema | done | 9 conditions (brakes/hub/CV/belt/hose) + cascade edges; Diagnosis checkboxes |
| F9 | LearningCycle read-model (compose from problems + decisions + calibration) | done | `LearningCycleService`; `GET .../learning-cycles`; Diagnosis/ProblemDetail panel |
| F10 | Sample-size UX on WhatWorked / recs / calibration chips / reports | done | `calibrationMeta`; n= chips; report Learning section |
| F11 | KnowledgeGap proposal queue (detect + accept/dismiss + export; never auto-write TBox) | done | `KnowledgeGapService`; store `gapProposals`; Diagnosis/Journal panel |
| F12 | AEMF aspect catalog (air/electricity/mechanical/fluid) on fault classes | done | Catalog + chips + per-aspect/class playbook prose on recs / Diagnosis / ProblemDetail |
| F13 | Logos-bridge subprocess via temp file (not stdin) for reliable realize | done | `@seam/logos-bridge` `runJson` writes temp JSON path (no stdin hang) |
| F14 | Batched realize classify (avoid full-view tableau hang) | done | RecognitionService chunks view classes; scope:auto per batch |

**Seams:** ForecastService, recognition, RecommendationsService, SolverService,
solution rollups; CascadePrognosisService + ontology cascade edges; AEMF catalog.  
**Anti-patterns:** Black-box ML ranking; silent priority changes; using
simulated history to calibrate production priors; presenting actuarial
failure % without outcome backing; inventing mechanical wear from the bus;
using AEMF as a second realize engine.

---

### 10. Reporting — shareable diagnostic note

**Ideal product.** From a vehicle or a problem, export a **shop note**: vehicle
identity, odometer, observation summary, proven classes (verbalized), open/
solved problems, ranked actions, policy holds, decisions/outcomes, linked
campaigns. Markdown first (copy/share); print stylesheet second; PDF optional.
Reports are compose-only — they never become a new source of truth.

**Strategy.** Reporting is a **read-model composition** over existing APIs.
Ship Markdown export as soon as verbalize + decisions are good enough; polish
print later. One template, two scopes (vehicle snapshot vs single case).

| # | Work piece | Status | Notes |
|---|---|---|---|
| G1 | Report compose service (vehicle \| problem scope) | done | `ReportService` |
| G2 | Markdown download / copy | done | `ReportDownload` |
| G2b | Garage JSON dump + CSV tables + JSON import | done | `GarageExportService`, Journal panel |
| G3 | Print-friendly HTML / PDF | done | Report `html` + print CSS; Print button (browser print-to-PDF) |
| G4 | Include verbalized proofs + campaign refs | done | Narration + campaigns in Markdown |
| G5 | Optional “attach last drive session summary” | done | Report `lastSession` + Markdown/HTML section |

**Seams:** recognition, problems, decisions, campaigns, verbalize, Journal.  
**Anti-patterns:** Editing domain facts inside a report; PDF-only first;
reports that claim classes not returned by realize.

---

## Planned Backlog

Ordered roughly by product-goal impact. Prefer closing **partial** / **missing**
goals before nice-to-haves. Ideal-solution piece ids (S1, A2, …) are the
canonical breakdown; backlog rows are schedulable delivery units.

### Market UX research (2026) → backlog seeds

Competitive scan (BlueDriver, FIXD, OBDLink + Torque/FORScan, Car Scanner ELM,
Carista/OBDeleven coding apps). Auto-architect’s differentiator remains
propose/dispose + durable garage memory — we steal *clarity*, not subscriptions
or proprietary enhanced-PID lock-in.

| Insight from market | Our gap | Backlog response | Priority |
|---|---|---|---|
| BlueDriver/FIXD: immediate “what fixed this / what next” | Dashboard listed evidence without a single next-step hero | **UX1** Next-action console (done this cycle) | — |
| BlueDriver: verified-fix reports from shop outcomes | WhatWorked exists but not next to DTC rows | **UX2** DTC-row “what worked” chips from solution history | high |
| Torque/OBDLink: fast live PIDs + custom dash | Per-vehicle Mode 01 layout + Customize on Live gauges | **UX3** done (local prefs; not garage-export) | — |
| Smog/readiness tiles in consumer apps | STATUS → `imStatus` + Dashboard monitor tiles | **UX4** done (still not a legal smog cert) | — |
| Shop tools: permanent DTCs after clear | Gateway now captures Mode 0A (thin AT) | **S8** done | — |
| FORScan/Carista: deep module maps | Full CAN/UDS map is OEM-proprietary; out of MVP scope | **CAN1** Research note + guided discover depth only (no invented bus map) | medium |
| Plain-English first | Narration leads next-action + proven list; DTC tooltips carry fluent | **UX5** done | — |
| One-tap scan ritual | Dashboard copyable dry-run/live/watch; browser still cannot hit MX+ | **S1** hardware validation still open | critical |

**CAN bus mapping principle:** Do not invent a whole-vehicle CAN matrix from
generic OBD-II. Map *what we can lawfully observe* (Mode 01–07, discovery bits,
freeze frame, Mode 06 seeds) and grow OEM cartridges from evidence + TSBs.
Enhanced UDS/module trees stay behind an explicit project (Functions / external
tool), never fake completeness.

### Discovery — apprentice-smart diagnosis (2026-07-22)

**Product ask:** Be the smartest *and* most informative diagnoser — pull all
lawful vehicle information; diagnose from **symptoms + live data + ontology +
vehicle history**; explain causes so an apprentice fully understands the
vehicle, the problem, and the solutions.

**What already ships (spine is real):** perceive → realize → draft/solve →
recommend → verify → Journal; AEMF framing; fluent narration (membership
proofs); classEvidence; WhatWorked / LearningCycle / calibration; counterfactuals;
cascade watchlist; case timeline. Types include `CausalModel` on
`DiagnosticProblem` but cartridges **do not fill it**.

**Market / pedagogy gap (vs shop mentors + consumer apps):** BlueDriver/FIXD
lead with “what next” and verified-fix stats; good mentors teach
*differentials* (“why coil before injector,” “how EVAP leak tests work”). We
rank and prove membership well; we under-teach **cause structure** and
**history-as-story**. Ontology `notes` are SAE-membership glosses, not root-cause
lessons. Diagnosis UI is still more class-id-forward than Dashboard UX5.

| Insight | Our gap | Backlog response | Priority |
|---|---|---|---|
| Mentors narrate causes + differentials | `CausalModel` unused; notes ≠ teaching | **A6** fill causal model from cartridges + evidence | critical |
| Apprentice needs one “why / how we know / prove next” surface | Panels are fragmented (AEMF, evidence, WhatWorked, CFs) | **A7** composed causal brief on Diagnosis + ProblemDetail | critical |
| “What fixed it” should teach, not only count | Solution history is n= rollups | **X6** solution narrative cards → feed A7 | high |
| Know the vehicle before deep diagnosis | VIN/odo optional; no Diagnosis dossier | **V1** vehicle dossier + identity ritual | high |
| Human complaints matter (smell, stall, rough) | Only bus symptoms enter perception | **H6** complaint/symptom journal → framing only | medium |
| Plain English on Diagnosis | Fluent primary on Dashboard; Diagnosis still jargon-heavy | **I7** fluent-first proven list | medium |
| OEM TSB context in the lesson | Campaigns are parallel cards | **R6** link campaign steps into A7 brief | medium |
| Optional LLM gloss | D5 planned without structured fuel | **D5** only after A6/A7 | medium |

**Build order (logical):**
`A6` → `A7` (+ `I7` polish) → `X6` → `V1` ∥ `H6` ∥ continue `A4` → `R6` → `D5`.

**Integrity:** Causal briefs and LLM advise may *propose* causes and lessons;
realize still owns class membership; empty DTCs / missing STATUS never mean
healthy; history never invents a fix that was not logged and verified.

### Closes product goals (prefer these)

| Feature | Pieces | Status | Priority | Why now | Likely reuse seams |
|---|---|---|---|---|---|
| Causal model on draft/solve (cartridge + evidence) | A6 | planned | critical | Unlocks teaching-grade differentials without a second classifier. | `CausalModel`, cartridges, ActionService draft/solve |
| Apprentice causal brief (why / evidence / prove next) | A7 | planned | critical | Single informative diagnosis surface from data + ontology + history. | Diagnosis, ProblemDetail, AEMF, WhatWorked, LearningCycle |
| Solution narrative cards (not just n=) | X6 | planned | high | Makes history teach “what fixed what and how we know.” | solution-history, LearningCycle, A7 |
| Vehicle dossier + VIN/odo ritual on Diagnosis | V1 | planned | high | Apprentice must know *which* vehicle/systems before causes. | VehicleProfile, discovery, campaigns |
| Diagnosis fluent-first proven classes | I7 | planned | medium | Parity with UX5; less jargon barrier. | Recognition.narration, Diagnosis |
| Operator complaint / symptom journal → framing | H6 | planned | medium | Human symptoms enrich cases without inventing realize classes. | DiagnosticProblem framing, Journal |
| Campaign/TSB steps inside causal brief | R6 | planned | medium | OEM context in the lesson, still applicability-only. | known-campaigns, A7 |
| Propose-only LLM advise (causes/framing gloss) | D5 | planned | medium | After A6/A7 so advise has structured fuel; LOGOS disposes. | logos-bridge / agent-service, A7 |
| Dashboard next-action console (at-a-glance) | UX1 | done | high | Closes BlueDriver/FIXD “what now” clarity gap. | `NextActionConsole`, Dashboard |
| DTC-row “what worked” from solution history | UX2 | done | high | `DtcWhatWorkedChips` via classEvidence→solution-history; no invented fixes. | Dashboard DTC list, `solutionHistoryUi` |
| Dashboard one-click simulate / import-log affordance | UX6 | done | medium | `EvidenceIngestPanel` on Dashboard; Journal keeps full export. | Dashboard, importObservationLog, simulateDriveSession |
| Plain-English next-action + DTC tooltips | UX5 | done | medium | Fluent narration leads at-a-glance + proven list; class ids secondary. | `NextActionConsole`, Dashboard |
| I/M readiness / monitor completion panel | UX4 | done | high | Gateway STATUS → batch `imStatus`; readiness API + Dashboard monitor tiles; never invent from empty DTCs. | `im_status.py`, `ImStatusObservation`, `ReadinessPanel` |
| Mode 0A permanent DTC capture | S8 | done | medium | Thin `GET_PERMANENT_DTC` (Mode 0A) in gateway; UI already paints `permanent`. | `obd_gateway/mode0a.py`, `read_dtcs` |
| Live OBDLink MX+ dry-run (scan/watch → Dashboard) | S1 | partial | critical | `GatewayScanCommands` on Dashboard; live MX+ dry-run still needs operator hardware. | `EvidenceIngestPanel`, OPERATOR_OBD_MANUAL |
| Saved per-vehicle gauge layout | UX3 | done | medium | Customize chips + `?pids=` live-gauges; localStorage per vehicle (Mode 01 allowlist). | `normalizeLiveGaugePids`, LiveGaugeStrip, `gaugeLayoutPrefs` |
| CAN/UDS map research → discover depth only | CAN1 | partial | medium | Discovery page states lawful observe boundary (no invented OEM CAN/UDS maps). Deeper guided-discover depth still open. | Discovery, `OBD_EDGE_CONTRACT` |
| Logos-bridge subprocess temp-file transport (fix stdin hang) | F13 | done | critical | Unblocks live realize/recognition/gap refresh. | `@seam/logos-bridge` in software-architect |
| Batched recognize classify (full-view tableau hang) | F14 | done | critical | Full view + MisfireUnderLoad ⊔ defs hung; batch of 4 under scope:auto. | RecognitionService, `classesForView` |
| AEMF vehicle-system aspects (air/elec/mech/fluid) | F12 | done | high | Catalog, chips, and principled playbook prose. | `vehicle-system-aspects.json`, Diagnosis, recs, ProblemDetail |
| AEMF playbook / recommendation framing | F12 | done | medium | `aemfPlaybookProse` + `Recommendation.aemfPlaybook`; Diagnosis / ProblemDetail panels. | ontology helpers, RecommendationService, web-ui |
| Logos tableau perf for disjunctive fault classes | F14 | planned | medium | Upstream metalanguage: realize full view without batching. | metalanguage engine |
| Durable observation history + freeze-frame retention | S5, H3 | done | high | Prune + odometer/session on case timeline events. | `ObservationService`, `ActionService` stamps |
| Continuous drive session recorder | S4, H3, F4, G5 | done | medium | Sessions, report attach, timeline stamps, session-scoped trends. | `DriveSessionService`, `ForecastService` |
| Problem caseboard + verify-after-repair + reopen | P2–P5, X5 | done | medium | Caseboard + verify-before-solved shipped. | `DiagnosticProblem`, Diagnosis UI |
| Case timeline (problems + decisions) | H2 | done | medium | Case narrative on Diagnosis / ProblemDetail; Journal stays audit. | `CaseTimelineService` |
| Recommendation card richness + status lifecycle UI | R2, R3 | done | medium | Cost/risk on cards; accept/dismiss/convert via ActionService. | `RecommendationPanel`, RecommendationService |
| Multi-signal trend expansion (beyond oil) | F3 | done | medium | LTFT + load → realize; coolant UI-only. | ForecastService, recognition |
| Cascade prognosis (likely next failures) | F6–F8 | done (thin) | — | On-command watchlist + operator wear stages; ordinal bands. Expand catalog as shop priors harden. | ontology cascade edges, recognition, ForecastService Trends, Diagnosis UI |
| Garage Epistemic Loop (LearningCycle + sample-size + knowledge gaps) | F9–F11 | done | — | Co-evolution read-model + propose/dispose gap queue. | LearningCycleService, KnowledgeGapService, calibrationMeta, Diagnosis/Journal |
| Print/PDF diagnostic report polish | G3, G5 | done | medium | Print HTML + last-session summary on reports. | `ReportService`, `ReportDownload` |
| Comprehensive SAE/ISO PID & DTC knowledge base | S7, A4 | partial | medium | ~134 curated P0xxx + circuit cartridges; full J2012 still open for rarer codes. | dictionaries, ontology lint, `test_pid_seed.py` |
| Shared `@auto/ui-components` | I5 | partial | medium | Thin `EmptyEvidenceState` in web-ui (DTCs/PIDs/FF/Mode06/sessions); full package still open. | `EmptyEvidenceState.tsx`, UX_GUIDELINES |

### Platform / coverage (support goals, not a goal themselves)

| Feature | Status | Priority | Why now | Likely reuse seams |
|---|---|---|---|---|
| Expand DTC dictionary beyond Tigershark seed set | partial | medium | + coil/injector/MAP/knock/TPS; rarer P0xxx / OEM P1xxx still open. | `dtc-dictionary.json`, ontology lint |
| Fill GM Vortec 6.0 / Silverado 2500 HD OEM cartridge | planned | high when truck scans available | Profile is 2003 2500 HD gas 6.0L; stub inert until curated GM TSBs. | `gm-vortec-6.0-stub.ts`, vehicle profiles |
| In-app Proxi / enhanced BCM session over MX+ | planned | low until explicit UDS project | Guided Functions v1 is external AlfaOBD; do not clone AlfaOBD. | future edge path, not Mode 01–07 |
| Bluetooth auto-discovery / MX+ preferred adapter profile | planned | medium | Less friction for scanning. | `obd_gateway/config.py`, `client.py` |
| Expand discover beyond seed via raw `0100/0120/…` support-bit decode | planned | low | v1 probes `STANDARD_PID_COMMANDS` only; full bitmask catalog if needed. | `obd_gateway/discovery.py`, pid dictionary |
| Propose-only LLM agent loop (advise pass) | planned | medium | LLM proposes, LOGOS disposes — not required for OBD correctness. | logos-bridge, cartridges, new `apps/agent-service` |
| OpenAPI 3.1 export from Fastify | planned | low | External tooling once surface stabilizes. | `apps/api` routes |
| Auth / single-user local identity (optional JWT) | planned | low until multi-user | Before any network exposure. | garden `AuthService` patterns |
| SAE J1939 heavy-duty CAN support (PGN model) | planned | low | Only if class-3+ diesel added. | new edge path / ontology view |
| Android/companion read-only client | planned | low | Web-ui first. | API read endpoints |
| Extract shared `@seam/logos-bridge-core` | planned | low | Replaces advisory drift check once both apps stabilize. | logos-bridge copies, `check-bridge-drift` |
| Coverage thresholds (vitest / codecov) | planned | low | Prefer honest layers over vanity %. | `TESTING_DEV_GUIDE.md`, CI |
| Ontology browser page (read-only TBox / views / DTC dict) | planned | low | Debug aid; keep lighter than garden. | `@auto/ontology` |
| Multi-vehicle comparison dashboard | planned | low | Only valuable with ≥2 real vehicles. | VehicleSwitcher, recognition |

#### Design note — Cascade prognosis (parked for research)

**Working name:** Cascade prognosis (UI: “Likely next” / “What may go next”).  
**Not:** a replacement for `ForecastService` PID projections, nor actuarial
insurance probabilities.

**Likelihood (decided leaning):** ordinal bands only — `Watch` / `Elevated` /
`High` — plus cited evidence and optional time or mileage **ranges**. Do **not**
ship %-chance-of-failure as real probability until outcome history can back it.
Optional later: a 0–1 *score* labeled as curated prior × evidence weight
(explicitly not actuarial).

**Scope options researched (pick / hybrid when unparking):**

| Id | Meaning |
|---|---|
| **1A** | OBD / diagnostic cascades only — edges among fault classes & Trends already in the ontology spine (e.g. misfire under load → catalyst damage risk; oil decline → MultiAir starvation). |
| **1B** | 1A plus a small curated **mechanical wear** catalog that requires **operator-entered** stage (pad wear, rotor condition, bearing noise, etc.) — never invented from Mode 01/03 alone. |
| **Hybrid (recommended when returning)** | One shared **cascade-edge** schema; two evidence *sources*: (1) bus-backed / realize-proven antecedents, (2) operator-asserted wear stages. Same prognosis UI and ordinal bands. |

**Clever multi-phase shape (initial thought to revisit later):**

1. **Phase F6 — Edge catalog.** Declare a small set of high-confidence, common
   `antecedent → consequent` edges in ontology/cartridges (role or JSON catalog
   with: consequent class or watch-concept, ordinal prior band, optional
   horizon range template, required evidence kinds, citation / shop rationale).
   Prefer edges operators already believe (catalyst after chronic misfire; oil
   starvation after chronic oil loss) over exotic long chains.
2. **Phase F7 — On-command prognosis (1A-shaped).** Service loads current
   recognition + open problems + flagged Trends; matches antecedents; emits a
   ranked watchlist with band + evidence citations + optional horizon. Propose
   only — does not invent proven classes; optional “open as watch problem”
   goes through ActionService. Surface on Diagnosis / ProblemDetail (reuse
   surfaces; avoid a new nav item unless volume demands it).
3. **Phase F8 — Wear layer (1B-shaped).** Same edge matcher; antecedents may
   also be `manualCondition` stages on the vehicle (or problem). Mechanical
   cascades (pads → rotors → hubs/bearings) live here. OBD never invents pad
   thickness.

**Integrity rules:** ontology owns consequent meaning; heuristics/LLM may
propose edges later but LOGOS/`realize` still owns *current* class membership;
empty watchlist is honest; simulated batches must not quietly inflate bands;
update Mastery Guide when this ships (`UX_GUIDELINES` §4).

**Why parked:** needs research on which cascades are high-confidence & common
enough for this garage, and how much mechanical wear entry operators will
actually maintain.

---

## Implemented History

| Feature | When | Where / docs |
|---|---|---|
| Sibling monorepo scaffold (pnpm, tsconfig, editable LOGOS setup) | 2026-07 | root `package.json`, `scripts/setup-solver.mjs` |
| SAE-generic DL ontology + FCA Tigershark view | 2026-07 | `packages/ontology/dl-ontology.json`, `ONTOLOGY_DEV_GUIDE.md` |
| Vehicle profile registry (Jeep + Silverado stub) | 2026-07 | `vehicle-profiles.json`, `ADD_A_VEHICLE.md` |
| Realize + reason Python fixtures (misfire / safety hold) | 2026-07 | `packages/ontology/fixtures/*` |
| Second policy reason fixture (MultiAirOilStarvation forbids clear-codes) | 2026-07 | `oilstarvation_reason_fixture.json`, `PolicyService` `R_forbid_clear_oilstarvation`, reason-integration + policy tests |
| Shared packages: semantic-types, validation, logos-bridge, game-theory | 2026-07 | `packages/*` |
| Cartridges: misfire, lean-fuel, evap, cam-crank, fca-tigershark-2.4, gm stub | 2026-07 | `packages/cartridges`, `ADD_A_CARTRIDGE.md` |
| Fastify API: recognition, policy, solver, actions, observations, campaigns, forecast | 2026-07 | `apps/api`, `API_DEV_GUIDE.md` |
| Policy FOL-safe vehicle IDs for `reason` | 2026-07 | `apps/api/src/services/policy.ts` |
| Framing `desiredState.successCriteria` so `solve` ranks (not clarify-values) | 2026-07 | cartridge `draft` helpers, `ActionService` |
| Python obd-gateway with scan/watch/simulate | 2026-07 | `apps/obd-gateway`, `OBD_EDGE_CONTRACT.md` |
| React UI: Dashboard, Diagnosis, ProblemDetail, Campaigns, Journal | 2026-07 | `apps/web-ui`, `UX_GUIDELINES.md` |
| Curated DTC dictionary + W80/W84 / TSB 05047457A campaigns | 2026-07 | `dtc-dictionary.json`, `known-campaigns.json` |
| Ontology-lint script + CI (`verify` + `ontology-lint` jobs) | 2026-07 | `scripts/lint-ontology.mjs`, `.github/workflows/ci.yml` |
| FakeLogosBridge unit tests across API services | 2026-07 | `packages/logos-bridge`, `apps/api/src/services/*.test.ts` |
| Public GitHub repo | 2026-07 | https://github.com/cyborgbear33/auto-architect |
| Project documentation set (handoff, architecture, AI guides, backlog) | 2026-07 | `docs/` |
| Real-LOGOS integration tests in CI (realize/reason/schema, beyond ontology-lint) | 2026-07 | `packages/logos-bridge/src/{realize,reason,schema}-integration.test.ts`, `.github/workflows/ci.yml`, `TESTING_DEV_GUIDE.md` |
| Advisory logos-bridge drift check vs garden-architect | 2026-07 | `scripts/check-bridge-drift.mjs`, `pnpm check:bridge-drift`, wired into `pnpm healthcheck` |
| One-time logos-bridge seam sync vs garden (transport identical; domain renames kept) | 2026-07 | `bridge.ts` / `serve-client.ts` / `errors.ts` both repos, `AI_CODING_RULES.md` §10 |
| Shared `@auto/api-client` (typed fetch, ApiError, queryKeys; web-ui migrated) | 2026-07 | `packages/api-client`, `API_CLIENT_DEV_GUIDE.md`, `apps/web-ui/src/lib/api.ts` |
| Thin SAE PID/DTC seed (cartridge + DEFAULT_PIDS units/hex; P0019) | 2026-07 | `pid-dictionary.json`, `dtc-dictionary.json`, `HARDWARE_STANDARDS.md`, gateway `test_pid_seed.py` |
| Ruff lint/format for `obd-gateway` (wired into healthcheck + CI) | 2026-07 | `apps/obd-gateway/pyproject.toml`, `pnpm obd-gateway:lint`, `CODE_STANDARDS.md` |
| Postgres persistence (Drizzle store adapter + migrate-on-init) | 2026-07 | `apps/api/src/{db,store/drizzle.ts}`, `infrastructure/docker-compose.yml`, `STORAGE_DRIVER` / `DATABASE_URL`, `API_DEV_GUIDE.md` |
| Product-goals maturity map + ideal solutions (work pieces S1…G5) | 2026-07 | this file § Product goals / Ideal solutions |
| Evidence source labeling (I2) | 2026-07 | `GET .../evidence-provenance`, `EvidenceSourceBadge`, Dashboard/Diagnosis |
| Solution history rollup + What worked panel (X3/X4) | 2026-07 | `SolutionHistoryService`, `GET .../solution-history`, `WhatWorkedPanel` |
| Outcome → confidence calibration (D3/D4/R4/F2) | 2026-07 | `calibration.ts`, draft/solve/refresh hooks |
| Lean/cam-crank realize + cam-crank reason fixtures | 2026-07 | `packages/ontology/fixtures/*` |
| Recognition narration (verbalize + ontology notes) | 2026-07 | `RecognitionService`, Dashboard/Diagnosis |
| Freeze-frame + Mode 06 UI panels | 2026-07 | `EvidencePanels`, Dashboard |
| Markdown diagnostic report export | 2026-07 | `ReportService`, `ReportDownload` |
| DTC P0305–08 + more Mode 01 PID seed rows | 2026-07 | `dtc-dictionary.json`, `pid-dictionary.json` |
| Close pid_map↔dictionary Mode 01 gate + P0456/P0316 (S7 slice) | 2026-07 | 9 orphan PIDs seeded; bidirectional `test_pid_seed`; EvapCodeSmall/CylinderMisfire reuse |
| Live gauge strip + freshness (S2/I6) | 2026-07 | `GET .../live-gauges`, `LiveGaugeStrip`, Dashboard |
| Problem caseboard + verify-after-repair (P2–P5, X5) | 2026-07 | Diagnosis filters; abandon/escalate/reopen; `worked` → verifying → verify |
| Case timeline from problems + decisions (H2) | 2026-07 | `CaseTimelineService`, `GET .../case-timeline`, Diagnosis + ProblemDetail |
| Durable problem lifecycle event log | 2026-07 | `DiagnosticProblem.lifecycleEvents` stamped by ActionService |
| Multi-signal trends (F3) | 2026-07 | `ForecastService.summary`, RisingFuelTrim / RecurringHighLoad, Dashboard |
| Garage JSON dump + CSV export/import | 2026-07 | `GarageExportService`, `GET/POST /api/garage/*`, Journal `DataExportPanel` |
| Print-friendly diagnostic report HTML (G3) | 2026-07 | `ReportService` `html` + print CSS, `ReportDownload` Print |
| Drive sessions + simulated upload (S4) | 2026-07 | `DriveSessionService`, `drive_sessions` table, Dashboard `DriveSessionsPanel` |
| Observation retention / PID downsample (S5) | 2026-07 | `applyRetention`, `POST .../observations/prune` |
| Attach last drive session to diagnostic report (G5) | 2026-07 | `DriveSessionSummary`, `ReportService.lastSession` |
| Odometer / session on case timeline events (H3) | 2026-07 | lifecycle + DecisionRecord stamps; CaseTimelinePanel |
| Session-aware signal trends (F4) | 2026-07 | `forecast?sessionId=`, Dashboard drive-scope picker |
| Recommendation richness + lifecycle UI (R2/R3) | 2026-07 | cost/risk on cards; accept/dismiss/convert; `RecommendationPanel` |
| Campaign-backed recommendations (R5) | 2026-07 | refresh → campaign/TSB cards; `generatedFromCampaignIds`; manual convert |
| Evidence panel per proven class (A1) | 2026-07 | `Recognition.classEvidence`; Dashboard/Diagnosis `ClassEvidencePanel` |
| Rich / catalyst / O2 DTC families | 2026-07 | new ontology + cartridges; FallingFuelTrim; realize fixtures |
| Mode 06 meaning → recognition (A3) | 2026-07 | `mode06-dictionary.json`; failed monitors feed realize; UI labels |
| O2 performance classes + A4 O2/EVAP seed | 2026-07 | P0131–34/P0151–54; Mode 06 $01/$05; O2_B* PIDs; P0457 |
| EGR / secondary air / downstream O2 + A5 stub parity | 2026-07 | new cartridges; Mode 06 $31/$71/$02/$06; GM shares SAE set |
| Gateway Mode 02 + Mode 06 population + DTC dictionary UI text | 2026-07 | `read_freeze_frames` / `read_mode06`; API+Dashboard `lookupDtc` fill |
| Functions panel + FCA Proxi guided procedure | 2026-07 | `special-procedures.json`; `/functions`; start/complete actions; external AlfaOBD |
| OBD capability discovery (vehicle intelligence report) | 2026-07 | gateway `discover`; API enrich; UI `/discovery`; Jeep gray-adapter hardware context |
| Vehicle & OBD mastery Guide (personalized + Print/PDF) | 2026-07 | `VEHICLE_OBD_MASTERY_GUIDE.md`; `MasteryGuideService`; UI `/guide` |
| Counterfactuals + disqualified UI + calibration explain chips (D2/F5) | 2026-07 | `Explainability.tsx`, `Recommendation.calibrationExplain`, FakeLogosBridge CFs |
| Cam/crank sensor + VVT Mode 06 SAE seed (A4/S7 slice) | 2026-07 | P0335–P0349, Mode 06 $35/$36, widened `CamCrankCorrelationFault` |
| Case timeline filters + evidence/session deep-links (H4/H5) | 2026-07 | `CaseTimelinePanel` filters; `/#evidence`, `/#session:…` |
| Cascade prognosis edge catalog + on-command watchlist (F6/F7) | 2026-07 | `cascade-edges.json`, `CascadePrognosisService`, Diagnosis panel |
| Mechanical wear layer on cascade edges (F8) | 2026-07 | `manual-conditions.json`, `PUT .../manual-conditions`, Diagnosis checkboxes |
| Offline OBD log import (`obdlog-v1` + ELM327 text + JSON batches) | 2026-07 | `POST .../observations/import-log`, Journal DataExportPanel |
| Coolant thermostat / ECT SAE KB (P0128 family) | 2026-07 | `coolant-thermostat` cartridge, `CoolantThermostatFault` / `EctSensorCircuitFault` |
| F8 wear catalog deepen (hub/CV/belt/hose/caliper/fluid) | 2026-07 | `manual-conditions.json` + cascade edges |
| Circuit DTC catalog (coil/injector/MAP/knock/TPS) | 2026-07 | 5 cartridges; P035x/P020x/P0105–09/P0325–33/P0120–24/P0220–23 |
| Garage Epistemic Loop (F9–F11) | 2026-07 | LearningCycleService; calibrationMeta + sample-size UX; KnowledgeGapService + export; Diagnosis/Journal panels |
| AEMF framing + playbook prose (F12) | 2026-07 | `vehicle-system-aspects.json`; chips + prose on Diagnosis/recs/ProblemDetail/Dashboard |
| Batched realize + bridge temp-file (F13/F14) | 2026-07 | Recognition classify batches; logos-bridge temp JSON (software-architect) |
| Dashboard next-action console (UX1) | 2026-07 | `NextActionConsole` — market-informed at-a-glance next step |
| DTC-row verified-fix chips (UX2) | 2026-07 | classEvidence join → solution-history chips on Dashboard Active DTCs |
| Dashboard evidence ingest ritual (UX6) | 2026-07 | Simulate drive + OBD log import on Dashboard; live scan stays Guide/CLI |
| Plain-English Dashboard (UX5) | 2026-07 | Fluent narration leads next-action + proven classes; DTC title tooltips |

---

## Explicit non-goals (for now)

- Reverse-engineering proprietary FCA enhanced diagnostics / AlfaOBD session cloning into `obd-gateway`
- In-app bi-directional Proxi / UDS over MX+ without an explicit enhanced-session project (guided external procedures **are** in scope)
- Direct ECU flashing or bi-directional actuator control from this app
- Claiming dealer-complete coverage from Mode 01–07 alone
- Multi-tenant SaaS before local single-operator durability exists
- Claiming calibrated probabilistic diagnosis before repair outcomes feed rankings
- Actuarial %-chance-of-failure / insurance-style prognosis without outcome-backed calibration (cascade prognosis, when built, uses ordinal bands + evidence — see F6–F8)
