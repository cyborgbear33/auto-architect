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
| **Scanning** — ingest OBD evidence | **partial** | Simulate/API ingest; live gauge strip + FF/Mode06 UI; source labels | Live MX+ path proven; drive sessions; retention policy | Live MX+ dry-run; Drive sessions; Durable observation history |
| **Analysis** — prove fault classes from evidence | **partial** | Recognition + narration + evidence; Mode 06 + O2 performance; growing SAE seed | Full J1979/J2012 catalog | SAE PID/DTC KB expansion |
| **Diagnosis (probabilistic)** — ranked next steps under uncertainty | **partial** | Outcome shrink-calibration on draft/solve + refresh | Family priors polish; counterfactuals UI | Counterfactuals UI; optional LLM advise |
| **Informing the user** — clear operator surfaces | **partial** | Source badges, narration, FF/Mode06 panels, report export | Live gauges; shared UI package | Live gauges; `@auto/ui-components` |
| **Recommendations** — what to do next | **partial** | Class + campaign cards; accept/dismiss/convert | Deeper campaign→repair playbooks | RecommendationService |
| **Problem tracking** — open cases through solve | **shipped** | Caseboard filters; abandon/escalate/reopen; `worked` → verifying → verify check | — | — |
| **Problem history** — cases over time | **partial** | Case timeline (problems + decisions); Journal is decision audit | Mileage/session on events; evidence deep-links | Drive sessions; Durable observation history; H3–H5 |
| **Solution history** — what fixed what, confirmed over time | **partial** | Rollup + panel; verify-before-solved (`worked` → verifying) | Stronger family priors / sample-size UX | Multi-signal trends |
| **History → better future decisions** | **partial** | Multi-signal trends + outcome calibration into draft/solve/refresh | Session-aware trends | Drive sessions (F4) |
| **Reporting** — shareable diagnostic note | **partial** | Markdown + garage JSON/CSV export/import | Print/PDF polish | Print-friendly HTML/PDF |

**Spine that already works:** ingest → realize → draft/solve → recommend → policy hold → log-repair → verify → Journal.  
**Not yet a complete garage product:** live scan UX, drive sessions, session-aware history.

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
| S1 | Validated live MX+ dry-run on Jeep (scan + watch → Dashboard) | todo | Checklist + gray MX+ access adapter noted in `OPERATOR_OBD_MANUAL.md` |
| S2 | Live gauge strip (RPM, load, fuel trim, coolant) + stale indicators | done | `GET .../live-gauges`, `LiveGaugeStrip` |
| S3 | Mode 06 + freeze-frame capture already in batches → **surface in UI** | done | Edge `read_freeze_frames` / `read_mode06` + `EvidencePanels` |
| S4 | DriveSession object (start/stop; batches linked by `sessionId`) | done | `DriveSessionService`; simulate path; Dashboard panel |
| S5 | Retention policy (keep FF/Mode06 forever; downsample high-rate PIDs) | done | `applyRetention` / prune; keep evidence; hourly PID downsample |
| S6 | Bluetooth / preferred-adapter discovery | todo | Friction reduction after S1 works manually |
| S7 | SAE PID/DTC dictionary depth for scan interpretation | partial | Gateway Mode 01 metadata closed + P0456/P0316; still not full J1979 |

**Seams:** `apps/obd-gateway`, `ObservationsService`, store batches, Dashboard.  
**Anti-patterns:** Classifying faults in the gateway; silent simulate-vs-live;
building a “scan dashboard” that bypasses `POST .../observations`.

---

### 2. Analysis — prove fault classes from evidence

**Ideal product.** Recognition answers: *which fault classes are proven from
current evidence?* Each proven class shows supporting DTCs/PIDs/freeze-frame/
Mode 06 and a short plain-English proof. Undecided / not-proven stays visible —
the system never invents “Healthy.” Cartridge coverage grows with the SAE KB
and engine-family views, not with ad-hoc UI strings.

**Strategy.** Keep **perceive → realize** as the only path to class membership.
Invest in *explanation and evidence adjacency*, not alternate classifiers.
Expand dictionaries and ontology views so perception has more lawful fuel.

| # | Work piece | Status | Notes |
|---|---|---|---|
| A1 | Evidence panel per `mostSpecific` class | done | `Recognition.classEvidence` + `ClassEvidencePanel` (no Mode 06 in v1) |
| A2 | Wire `verbalize` into Recognition API + Diagnosis UI | done | `Recognition.narration` + ontology-note fallback |
| A3 | Mode 06 as recognition input where ontology allows | done | Thin SAE/ISO OBDMID seed → perception → realize; unknown MIDs unlabeled |
| A4 | Broader curated DTC/PID KB + ontology lint parity | partial | EGR/AIR/downstream O2 + EGR PIDs; still not full J2012 |
| A5 | Engine-family cartridge depth (MultiAir real; EcoTec3 when truck exists) | partial | SAE set shared; GM stub inert until real truck |

**Seams:** cartridges, `RecognitionService`, logos-bridge `realize`/`verbalize`,
dictionaries, Diagnosis/Dashboard.  
**Anti-patterns:** UI-only “likely misfire” badges; LLM classifying without
realize; hiding undecided membership.

---

### 3. Diagnosis (probabilistic) — ranked next steps under uncertainty

**Ideal product.** A diagnostic case is a first-class `DiagnosticProblem` with
clear current/desired state. `solve` returns ranked actions with honest
uncertainty: solver scores *plus* priors from this vehicle’s (and optionally
engine-family) confirmed outcomes. Policy can forbid unsafe shortcuts
(e.g. clear-codes under oil starvation). Counterfactuals explain “why not #1.”
Probability language is calibrated — never fake precision.

**Strategy.** Today’s solve is **scoring under constraints**, not Bayesian
posteriors. Do not pretend otherwise. Close the loop:
`log-repair` outcomes → empirical priors → adjust playbook confidence / solve
inputs → re-rank. Keep policy defeasible and fail-closed. Optional LLM may
*propose* framing or candidate actions; LOGOS still disposes.

| # | Work piece | Status | Notes |
|---|---|---|---|
| D1 | Draft/solve + policy holds (MVP path) | done | ActionService + PolicyService |
| D2 | Surface counterfactuals / disqualified actions in UI | partial | Types exist; UI thin |
| D3 | Outcome → playbook confidence / action priors | done | `calibration.ts` → draft/solve/refresh |
| D4 | Family-level priors (same engineFamily) with small-sample caution | done | Family buckets + higher `k` |
| D5 | Optional propose-only LLM advise pass (draft candidates) | todo | Never skip realize/reason/solve |

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
| I5 | Shared `@auto/ui-components` | todo | Status, empty/error, evidence |
| I6 | Staleness / “last observation” chrome on Dashboard | done | Fresh/Stale badge on gauge strip |

**Seams:** web-ui pages, `UX_GUIDELINES`, api-client queryKeys.  
**Anti-patterns:** Flat 17-item nav; theorem-prover chrome in operator mode;
claims without evidence.

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

**Seams:** `RecommendationService`, recognition, campaigns, Dashboard.  
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
| H4 | Filter history by class, status, date, mileage | todo | Caseboard overlap |
| H5 | Deep link timeline event → evidence batch / freeze-frame | todo | |

**Seams:** problems, decisions, DriveSession, ObservationsService, Diagnosis.  
**Anti-patterns:** Journal-as-only-history; losing evidence when a problem is
marked solved.

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

**Seams:** `DecisionRecord`, `ProblemOutcome`, RecommendationsService, Journal.  
**Anti-patterns:** Outcomes that never get recorded; rollups that ignore
sample size; treating dismissed recommendations as confirmed fixes.

---

### 9. History → better future decisions & recommendations

**Ideal product.** Two memory lanes feed the future:

1. **Signal memory** — PID/Mode06/DTC trends and forecasts (oil today; more
   signals later) influence recognition when ontology allows.
2. **Outcome memory** — confirmed repairs shift priors and recommendation
   priority for the next similar case.

The operator sees *why* a priority moved (“worked 2/2 times on this vehicle”).
Small samples shrink toward cartridge defaults — never overfit one lucky fix.

**Strategy.** Keep lanes separate. Do not let trends invent classes outside
realize. Calibration is the flagship piece; multi-signal trends expand
ForecastService carefully with ontology backing.

| # | Work piece | Status | Notes |
|---|---|---|---|
| F1 | Oil-level trend → recognition evidence | done | ForecastService (narrow) |
| F2 | Outcome → confidence calibration into refresh + solve priors | done | `calibratePlaybook` |
| F3 | Multi-signal trends (fuel trim, coolant, load-at-misfire) | done | RisingFuelTrim / RecurringHighLoad → realize; coolant informing-only |
| F4 | Session-aware trends (per drive, not only global series) | done | `GET .../forecast?sessionId=`; Dashboard drive-scope picker; recognition stays global |
| F5 | Explainability chip: “priority raised because …” | todo | Informing overlap |

**Seams:** ForecastService, recognition, RecommendationsService, SolverService,
solution rollups.  
**Anti-patterns:** Black-box ML ranking; silent priority changes; using
simulated history to calibrate production priors.

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

### Closes product goals (prefer these)

| Feature | Pieces | Status | Priority | Why now | Likely reuse seams |
|---|---|---|---|---|---|
| Live OBDLink MX+ dry-run (scan/watch → Dashboard) | S1 | planned | high | Validates real scanning path CI never sees. | `apps/obd-gateway`, Dashboard |
| Durable observation history + freeze-frame retention | S5, H3 | done | high | Prune + odometer/session on case timeline events. | `ObservationService`, `ActionService` stamps |
| Continuous drive session recorder | S4, H3, F4, G5 | done | medium | Sessions, report attach, timeline stamps, session-scoped trends. | `DriveSessionService`, `ForecastService` |
| Problem caseboard + verify-after-repair + reopen | P2–P5, X5 | done | medium | Caseboard + verify-before-solved shipped. | `DiagnosticProblem`, Diagnosis UI |
| Case timeline (problems + decisions) | H2 | done | medium | Case narrative on Diagnosis / ProblemDetail; Journal stays audit. | `CaseTimelineService` |
| Recommendation card richness + status lifecycle UI | R2, R3 | done | medium | Cost/risk on cards; accept/dismiss/convert via ActionService. | `RecommendationPanel`, RecommendationService |
| Multi-signal trend expansion (beyond oil) | F3 | done | medium | LTFT + load → realize; coolant UI-only. | ForecastService, recognition |
| Print/PDF diagnostic report polish | G3, G5 | done | medium | Print HTML + last-session summary on reports. | `ReportService`, `ReportDownload` |
| Comprehensive SAE/ISO PID & DTC knowledge base | S7, A4 | partial | high | Gateway Mode 01 metadata closed; full J1979/J2012 still open. | dictionaries, ontology lint, `test_pid_seed.py` |
| Shared `@auto/ui-components` | I5 | planned | medium | Consistent trust/evidence UI. | `UX_GUIDELINES` |

### Platform / coverage (support goals, not a goal themselves)

| Feature | Status | Priority | Why now | Likely reuse seams |
|---|---|---|---|---|
| Expand DTC dictionary beyond Tigershark seed set | partial | medium | Rich/catalyst/O2 circuit+performance+heater + P0457; more P0xxx still open. | `dtc-dictionary.json`, ontology lint |
| Fill GM Vortec 6.0 / Silverado 2500 HD OEM cartridge | planned | high when truck scans available | Profile is 2003 2500 HD gas 6.0L; stub inert until curated GM TSBs. | `gm-vortec-6.0-stub.ts`, vehicle profiles |
| Bluetooth auto-discovery / MX+ preferred adapter profile | planned | medium | Less friction for scanning. | `obd_gateway/config.py`, `client.py` |
| Propose-only LLM agent loop (advise pass) | planned | medium | LLM proposes, LOGOS disposes — not required for OBD correctness. | logos-bridge, cartridges, new `apps/agent-service` |
| OpenAPI 3.1 export from Fastify | planned | low | External tooling once surface stabilizes. | `apps/api` routes |
| Auth / single-user local identity (optional JWT) | planned | low until multi-user | Before any network exposure. | garden `AuthService` patterns |
| SAE J1939 heavy-duty CAN support (PGN model) | planned | low | Only if class-3+ diesel added. | new edge path / ontology view |
| Android/companion read-only client | planned | low | Web-ui first. | API read endpoints |
| Extract shared `@seam/logos-bridge-core` | planned | low | Replaces advisory drift check once both apps stabilize. | logos-bridge copies, `check-bridge-drift` |
| Coverage thresholds (vitest / codecov) | planned | low | Prefer honest layers over vanity %. | `TESTING_DEV_GUIDE.md`, CI |
| Ontology browser page (read-only TBox / views / DTC dict) | planned | low | Debug aid; keep lighter than garden. | `@auto/ontology` |
| Multi-vehicle comparison dashboard | planned | low | Only valuable with ≥2 real vehicles. | VehicleSwitcher, recognition |

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

---

## Explicit non-goals (for now)

- Reverse-engineering proprietary FCA enhanced diagnostics / AlfaOBD session cloning
- Direct ECU flashing or bi-directional actuator control from this app
- Replacing a professional scan tool for dealer-level guided procedures
- Multi-tenant SaaS before local single-operator durability exists
- Claiming calibrated probabilistic diagnosis before repair outcomes feed rankings
