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
   @auto/logos-bridge  (execFile / spawn, injection-safe)
        ▲
        │  camelCase ⇄ snake_case seam; same transport/schema pattern as
        │  garden's @garden/logos-bridge
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

**Keeping the seam in sync:** `@auto/logos-bridge` and `@garden/logos-bridge`
are two independent copies of the same domain-agnostic transport/salvage
logic (`bridge.ts`, `serve-client.ts`, `errors.ts`), not a shared package —
there is currently no automated way to catch one side fixing a real LOGOS
wire bug and forgetting to port it to the other. `pnpm check:bridge-drift`
(also the last, advisory-only step of `pnpm healthcheck`) diffs those files
against a garden-architect checkout next to this repo as a reminder, not a
gate. If this project and garden-architect both stabilize further, consider
extracting a real shared `@seam/logos-bridge-core` package instead of two
hand-synced copies — tracked in `FUTURE_FEATURES.md`.

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
| `STORAGE_DRIVER` | `memory` today (Postgres deferred) |

**Run & verify:**

```bash
pnpm healthcheck             # one-shot: typecheck + biome + tests + ontology + gateway + UI build
# or discrete:
pnpm -r typecheck
pnpm lint
pnpm -r test
pnpm lint:ontology
pnpm obd-gateway:test

pnpm dev:api                 # http://localhost:4100  (in-memory, seeded Jeep)
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
| Generic cartridges (misfire, lean, EVAP, cam/crank) | shipped | `packages/cartridges/src/*.ts` |
| FCA MultiAir cartridge + GM EcoTec3 stub | shipped | `fca-tigershark-2.4.ts`, `gm-ecotec3-stub.ts` |
| `@auto/logos-bridge` + `FakeLogosBridge` | shipped | `packages/logos-bridge` |
| Real-LOGOS integration tests (realize/reason/schema), run for real in CI | shipped | `packages/logos-bridge/src/*-integration.test.ts`, `ontology-lint` CI job only |
| Ontology Zod registries + engineFamily→view→cartridge lint | shipped | `packages/ontology/src/schemas.ts`, `lint.ts` |
| API HTTP smoke (`buildApp` + inject) | shipped | `apps/api/src/app.smoke.test.ts` |
| logos-bridge drift check vs garden-architect (advisory) | shipped | `scripts/check-bridge-drift.mjs` |
| Fastify API (vehicles, observations, recognition, actions) | shipped | `apps/api` |
| In-memory store + seed Jeep | shipped | `apps/api/src/store` |
| Policy safety hold (`clear-codes-and-drive`) | shipped | `PolicyService` + Diagnosis UI |
| Oil-level trend forecast | shipped | `ForecastService` |
| React UI (5 routes) | shipped | `apps/web-ui` |
| Python obd-gateway (`scan` / `watch` / `--simulate`) | shipped | `apps/obd-gateway` |
| Ontology lint CI | shipped | `scripts/lint-ontology.mjs`, `.github/workflows/ci.yml` |
| Postgres persistence | **not yet** | see `FUTURE_FEATURES.md` |
| Auth / multi-user | **not yet** | see `FUTURE_FEATURES.md` |
| Live Mode 06 / freeze-frame UI richness | partial | API endpoints exist; UI is thin |
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
| [`ai/OBD_EDGE_CONTRACT.md`](ai/OBD_EDGE_CONTRACT.md) | OBD-II / CANBUS edge rules |
| [`ai/HARDWARE_STANDARDS.md`](ai/HARDWARE_STANDARDS.md) | SAE/ISO/CAN grounding reference |
| [`ai/TESTING_DEV_GUIDE.md`](ai/TESTING_DEV_GUIDE.md) | Vitest / pytest / FakeLogosBridge |
| [`ai/DOCUMENTATION_DEV_GUIDE.md`](ai/DOCUMENTATION_DEV_GUIDE.md) | How to maintain docs |
| [`../apps/obd-gateway/README.md`](../apps/obd-gateway/README.md) | Gateway CLI / install |

GitHub: https://github.com/cyborgbear33/auto-architect
