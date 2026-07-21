# AI_HANDOFF.md — start here to continue this project

This is the single orientation document for an AI agent (or human) picking the
project up. Read this end-to-end; it links to deep-dive guides rather than
repeating them. Goal: after this, you know **what the project is, how it's set
up, what it does, exactly where it stands, and how to continue** — safely and in
the established style.

**Learning the pattern (theory + practice):** if you want a complete lesson on
building an agent + deterministic ontology/reasoning app — with a runnable
LOGOS workshop and garden-architect as the original worked example — start at
the sibling guide:

[`../../metalanguage/docs/LESSON_AGENT_DETERMINISTIC_APPS.md`](../../metalanguage/docs/LESSON_AGENT_DETERMINISTIC_APPS.md)
(sibling checkout under `Projects/`). A short local pointer also lives at
[`docs/LESSON_AGENT_DETERMINISTIC_APPS.md`](LESSON_AGENT_DETERMINISTIC_APPS.md).

**Sibling reference app:** [`garden-architect`](../../garden-architect/garden-architect)
is the mature twin. Same LOGOS seam and propose/dispose architecture; different
domain (garden vs vehicle). Prefer copying *patterns* from garden, not wholesale
garden domain concepts.

---

## 1. What this is (the thesis)

Two repositories combine into one system built on a single principle:

> **The LLM/heuristic proposes, the formal engine disposes.**
> Generative judgment may suggest diagnoses and repair steps; a deterministic
> formal engine (LOGOS) verifies which fault class is actually proven from OBD
> evidence, resolves safety policy, ranks next actions, and refuses unsafe
> shortcuts — and never lets a heuristic self-certify. Every consequential step
> is checked by the engine and left as an auditable record.

The concrete instance is a **vehicle diagnostics system** whose first vehicle is
a **2015 Jeep Renegade Latitude (2.4L Tigershark MultiAir2)**, built generically
enough that a second vehicle (e.g. Chevrolet Silverado) is an engine-family +
cartridge addition, not a rewrite.

**Product reasons (maturity):** scanning, analysis, probabilistic diagnosis,
informing the operator, recommendations, problem tracking, problem/solution
history, history-informed future decisions, and reporting. Most are **partial**;
Markdown + print reports with last-session summary shipped. Summary + ideal
solutions (work pieces S1…G5):
[`FUTURE_FEATURES.md` § Product goals](FUTURE_FEATURES.md#product-goals-why-this-app-exists)
and [§ Ideal solutions](FUTURE_FEATURES.md#ideal-solutions-by-goal).

---

## 2. The two projects and how they connect

```
/home/cyborgbear/Projects/metalanguage        ← LOGOS: the formal engine (Python)
        │  package `logos`, CLI `python3 -m logos <cmd> --json`
        │  (+ warm `serve` NDJSON daemon)
        │  (DL realize, defeasible reason, Universal Problem Solver,
        │   forecast, verbalize)
        │
        │  consumed as an external dependency — NOT vendored/copied
        ▼
   @auto/logos-bridge  (thin re-export of @seam/logos-bridge)
        ▲
        │  transport + FakeLogos live in software-architect
        │
/home/cyborgbear/Projects/auto-architect      ← auto-architect: the app (TS + Python)
        pnpm monorepo — Fastify API, React UI, Python obd-gateway
```

**Why this shape (do not relitigate):**

1. LOGOS stays in `metalanguage`, reusable across domains (garden, auto, …).
2. The Node↔Python bridge is the **only** place that knows LOGOS's snake_case
   wire shape. Everything else in auto-architect stays camelCase and typed.
3. `obd-gateway` never imports the bridge or classifies faults — it only POSTs
   validated observations (same edge rule as garden's edge-gateway).

**Shared seam:** `@auto/logos-bridge` is a **re-export shim** over
[`software-architect`](../../software-architect/) `@seam/logos-bridge`
(`file:../../../software-architect/packages/logos-bridge`). Call sites still
import `@auto/logos-bridge`; vehicle realize/reason fixtures stay in this
repo's `*-integration.test.ts`. `pnpm check:bridge-drift` verifies the shim
(dependency + no forked transport sources). CI checks out software-architect
as a sibling so `pnpm install` resolves the `file:` dep. Do **not** reintroduce
a forked `bridge.ts` / `types.ts` here.

---

## 3. Setup / configuration

**Prerequisites:** Node ≥ 20, pnpm 9, Python ≥ 3.9 (3.12+ preferred).

```bash
# 1. LOGOS engine (editable install so the CLI is on PATH for this Python)
pip install -e /home/cyborgbear/Projects/metalanguage/engine[schema]
python3 -m logos --help            # verify

# 2. auto-architect
cd /home/cyborgbear/Projects/auto-architect
pnpm install                       # also runs scripts/setup-solver.mjs --check
```

**Environment:**

| Variable | Meaning |
|---|---|
| `LOGOS_PYTHON_BIN` | Python used by the bridge (default `python3`) |
| `LOGOS_TRANSPORT` | `serve` (warm daemon) or `subprocess` (one-shot) |
| `PORT` | API port (default `4100`) |
| `STORAGE_DRIVER` | `memory` (default) \| `postgres` \| `auto` (postgres if `DATABASE_URL` set) |
| `DATABASE_URL` | Postgres URL when using the Drizzle adapter (e.g. `postgres://auto:auto@localhost:5433/auto`) |

**Run & verify:**

```bash
pnpm healthcheck             # one-shot: typecheck + biome + tests + ontology + gateway + UI build
# or discrete:
pnpm -r typecheck
pnpm lint
pnpm -r test
pnpm lint:ontology
pnpm obd-gateway:test

pnpm dev:api                 # http://localhost:4100  (in-memory by default, seeded Jeep)
pnpm infra:up                # local Postgres on :5433 (docker compose)
DATABASE_URL=postgres://auto:auto@localhost:5433/auto pnpm dev:api:postgres
pnpm dev:ui                  # http://localhost:5173  (proxies /api → :4100)
```

Hardware-free evidence ingest:

```bash
pnpm obd-gateway:install
cd apps/obd-gateway && ../../.venv/bin/python3 -m obd_gateway \
  --vehicle-id veh:jeep-renegade-2015-latitude --simulate \
  --manual-pid ENGINE_LOAD=85 --simulate-dtc P0304:stored scan
```

Canonical health check: `pnpm -r test` + `pnpm lint:ontology` + `pnpm obd-gateway:test` green.

---

## 4. Architecture (one paragraph)

```
OBDLink MX+ → apps/obd-gateway → POST /api/vehicles/:id/observations
                                      ↓
                              apps/api services
                 Recognition (realize) · Policy (reason) · Solver (solve)
                                      ↓
                              @auto/logos-bridge → LOGOS
                                      ↓
                              apps/web-ui (Dashboard / Diagnosis / …)
```

Deep dive: [`ARCHITECTURE.md`](ARCHITECTURE.md). OBD contract:
[`ai/OBD_EDGE_CONTRACT.md`](ai/OBD_EDGE_CONTRACT.md).

---

## 5. What exists today (capability ledger)

| Area | Status | Where |
|---|---|---|
| DL TBox + views (`generic`, `fca-tigershark-2.4`) | shipped | `packages/ontology/dl-ontology.json` |
| Vehicle profile registry + engine families | shipped | `packages/ontology/vehicle-profiles.json` |
| Curated DTC dictionary + W80/W84 / TSB campaigns | shipped | `dtc-dictionary.json`, `known-campaigns.json` |
| Thin SAE PID dictionary seed (units / Mode 01 hex) | shipped | `pid-dictionary.json`, gateway `test_pid_seed.py` |
| Gateway Mode 01 PID metadata parity (S7 slice) | shipped | All `STANDARD_PID_COMMANDS` seeded; P0456/P0316 on existing concepts |
| Ruff lint/format for obd-gateway (healthcheck + CI) | shipped | `apps/obd-gateway/pyproject.toml`, `pnpm obd-gateway:lint` |
| Generic cartridges (misfire, lean, EVAP, cam/crank) | shipped | `packages/cartridges/src/*.ts` |
| FCA MultiAir cartridge + GM Vortec 6.0 stub | shipped | `fca-tigershark-2.4.ts`, `gm-vortec-6.0-stub.ts`; vehicle `veh:silverado-2500hd-2003` |
| `@auto/logos-bridge` → `@seam/logos-bridge` re-export + FakeLogosBridge | shipped | `packages/logos-bridge` shim; transport in software-architect |
| Real-LOGOS integration tests (realize/reason/schema), run for real in CI | shipped | `packages/logos-bridge/src/*-integration.test.ts`, `ontology-lint` CI job only |
| Ontology Zod registries + engineFamily→view→cartridge lint | shipped | `packages/ontology/src/schemas.ts`, `lint.ts` |
| API HTTP smoke (`buildApp` + inject) | shipped | `apps/api/src/app.smoke.test.ts` |
| logos-bridge shim integrity vs software-architect (advisory) | shipped | `scripts/check-bridge-drift.mjs` |
| Fastify API (vehicles, observations, recognition, actions) | shipped | `apps/api` |
| In-memory store + seed Jeep | shipped | `apps/api/src/store/memory.ts` |
| Postgres store (Drizzle; migrate-on-init) | shipped | `apps/api/src/store/drizzle.ts`, `apps/api/drizzle/`, `pnpm infra:up` |
| Evidence source labeling (live / sim / manual) | shipped | `GET .../evidence-provenance`, Dashboard/Diagnosis badges |
| Solution history rollup (“what worked before”) | shipped | `GET .../solution-history`, Diagnosis/ProblemDetail panel |
| Outcome → confidence calibration | shipped | `calibration.ts` → draft/solve/recommendation refresh |
| Garage Epistemic Loop (LearningCycle + knowledge gaps) | shipped | `LearningCycleService`, `KnowledgeGapService`, `calibrationMeta`, Diagnosis/Journal panels |
| Recommendation richness + lifecycle (R2/R3) | shipped | cost/risk; accept/dismiss/convert; `RecommendationPanel` |
| Campaign-backed recommendations (R5) | shipped | refresh emits TSB/recall cards; never invents fault classes |
| Recognition narration (verbalize / ontology notes) | shipped | `Recognition.narration`, Dashboard/Diagnosis |
| Evidence panel per proven class (A1) | shipped | `Recognition.classEvidence` + `ClassEvidencePanel` |
| Rich / catalyst / O2 DTC families | shipped | cartridges + ontology; FallingFuelTrim; DTC-only cat/O2 |
| Mode 06 meaning → recognition (A3) | shipped | SAE/ISO OBDMID seed; failed monitors → realize; labeled UI |
| O2 performance + A4 SAE seed slice | shipped | P0131–34/P0151–54; Mode 06 $01/$05; O2 voltage PIDs; P0457 |
| EGR / secondary air / downstream O2 | shipped | cartridges + Mode 06; Vortec 6.0 shares SAE set; OEM stub still inert |
| Freeze-frame + Mode 06 UI | shipped | `EvidencePanels` on Dashboard |
| Gateway Mode 02 + Mode 06 capture | shipped | `read_freeze_frames` / `read_mode06`; simulate flags for lab |
| DTC dictionary text on Dashboard rows | shipped | API `enrichDtcDescription` + UI `lookupDtc` fallback |
| Operator OBD manual (MX+ / Jeep gray adapter) | shipped | `docs/OPERATOR_OBD_MANUAL.md`; Jeep profile notes |
| Functions / Proxi guided procedure | shipped | `special-procedures.json`; `/functions`; ActionService start/complete |
| OBD capability discovery (vehicle intelligence) | shipped | gateway `discover`; `DiscoveryService`; UI `/discovery` |
| Vehicle & OBD mastery Guide (print / Markdown) | shipped | `VEHICLE_OBD_MASTERY_GUIDE.md`; `MasteryGuideService`; UI `/guide` |
| Markdown diagnostic report export | shipped | `GET .../report`, `ReportDownload` |
| Live gauge strip (RPM/load/STFT/coolant + stale) | shipped | `GET .../live-gauges`, `LiveGaugeStrip` |
| Problem caseboard + verify-after-repair (P2–P5) | shipped | Diagnosis filters; abandon/escalate/reopen; `worked` → verifying → verify |
| Case timeline (H2) | shipped | `GET .../case-timeline`, `CaseTimelinePanel` on Diagnosis / ProblemDetail |
| Odometer / session on case events (H3) | shipped | Stamped on lifecycle + decisions; shown on CaseTimelinePanel |
| Durable lifecycle event log | shipped | `lifecycleEvents` on `DiagnosticProblem`; ActionService append-only stamps |
| Multi-signal trends (F3) | shipped | `ForecastService.summary`; Rising/FallingFuelTrim / RecurringHighLoad → realize |
| Session-aware trends (F4) | shipped | `GET .../forecast?sessionId=`; Dashboard scope picker; recognition stays global |
| Garage JSON + CSV export/import | shipped | `GarageExportService`, Journal Export panel; merge import with batch dedupe |
| Print-friendly report HTML (G3) | shipped | Report `html` + print CSS; `ReportDownload` Print |
| Last drive session on reports (G5) | shipped | `DriveSessionSummary` / `lastSession` in Markdown + HTML |
| Drive sessions + simulate upload (S4) | shipped | `DriveSessionService`, Dashboard `DriveSessionsPanel` |
| Observation retention (S5) | shipped | Keep DTC/FF/Mode06; hourly downsample of old PID-only batches |
| Policy safety holds (`clear-codes-and-drive` under misfire / MultiAir oil starvation / cam-crank) | shipped | `PolicyService`, reason fixtures, Diagnosis UI |
| Oil-level trend forecast | shipped | `ForecastService` |
| React UI (Dashboard, Diagnosis, Discovery, Functions, …) | shipped | `apps/web-ui` |
| `@auto/api-client` (typed fetch + queryKeys; web-ui thin re-export) | shipped | `packages/api-client`, `API_CLIENT_DEV_GUIDE.md` |
| Python obd-gateway (`scan` / `watch` / `discover` / `--simulate`) | shipped | `apps/obd-gateway` |
| Ontology lint CI | shipped | `scripts/lint-ontology.mjs`, `.github/workflows/ci.yml` |
| Auth / multi-user | **not yet** | see `FUTURE_FEATURES.md` |
| Cascade prognosis (likely next failures) | **backlogged** | F6–F8 in `FUTURE_FEATURES.md`; research parked; ordinal bands not fake % |
| Live Mode 06 / freeze-frame UI richness | partial | Edge populates FF + SAE-seed Mode 06; OBDMID labels + pass/fail; raw TID/MID behind debug |
| LLM agent loop (propose-only) | **not yet** | garden has `agent-service`; auto does not |

---

## 6. How to continue (safe order)

1. Read [`docs/ai/README_FOR_AI.md`](ai/README_FOR_AI.md) (coding-rules read order).
2. Check [`docs/FUTURE_FEATURES.md`](FUTURE_FEATURES.md) before inventing scope.
3. Prefer extending ontology + cartridges over inventing API fields.
4. Never let `obd-gateway` or the UI own fault classification.
5. Keep multi-vehicle: engine-family views, not Jeep-hardcoded generics.
6. When a feature ships, move it in `FUTURE_FEATURES.md` (Planned → Implemented).

---

## 7. Doc map

| Doc | Use |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | As-built service graph and contracts |
| [`FUTURE_FEATURES.md`](FUTURE_FEATURES.md) | Canonical backlog |
| [`ai/README_FOR_AI.md`](ai/README_FOR_AI.md) | Read order for coding |
| [`ai/GLOBAL_DEV_GUIDE.md`](ai/GLOBAL_DEV_GUIDE.md) | Stack + monorepo invariants |
| [`ai/AI_CODING_RULES.md`](ai/AI_CODING_RULES.md) | Ontology-first coding rules |
| [`ai/CODE_STANDARDS.md`](ai/CODE_STANDARDS.md) | TS / Biome / `pnpm healthcheck` DoD |
| [`ai/UX_GUIDELINES.md`](ai/UX_GUIDELINES.md) | Product UX / trust / IA |
| [`ai/UI_DEV_GUIDE.md`](ai/UI_DEV_GUIDE.md) | React/TanStack technical rules |
| [`ai/API_DEV_GUIDE.md`](ai/API_DEV_GUIDE.md) | Fastify routes + ActionService gate |
| [`ai/ONTOLOGY_DEV_GUIDE.md`](ai/ONTOLOGY_DEV_GUIDE.md) | DL TBox, views, DTC dictionary |
| [`ai/ADD_A_CARTRIDGE.md`](ai/ADD_A_CARTRIDGE.md) | Extend a diagnostic domain |
| [`ai/ADD_A_VEHICLE.md`](ai/ADD_A_VEHICLE.md) | Add Silverado (or any next car) |
| [`OPERATOR_OBD_MANUAL.md`](OPERATOR_OBD_MANUAL.md) | Human OBDLink MX+ setup + thorough-scan integration plan |
| [`VEHICLE_OBD_MASTERY_GUIDE.md`](VEHICLE_OBD_MASTERY_GUIDE.md) | In-app Guide curriculum (vehicle → ontology → discovery → troubleshoot) |
| [`ai/OBD_EDGE_CONTRACT.md`](ai/OBD_EDGE_CONTRACT.md) | OBD-II / CANBUS edge rules |
| [`ai/HARDWARE_STANDARDS.md`](ai/HARDWARE_STANDARDS.md) | SAE/ISO/CAN grounding reference |
| [`ai/TESTING_DEV_GUIDE.md`](ai/TESTING_DEV_GUIDE.md) | Vitest / pytest / FakeLogosBridge |
| [`ai/DOCUMENTATION_DEV_GUIDE.md`](ai/DOCUMENTATION_DEV_GUIDE.md) | How to maintain docs |
| [`../apps/obd-gateway/README.md`](../apps/obd-gateway/README.md) | Gateway CLI / install |

GitHub: https://github.com/cyborgbear33/auto-architect
