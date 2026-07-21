# Architecture & Technical Reference (as-built)

This is the thorough, *as-built* technical document for `auto-architect`.
It explains how the system actually works today, the contracts between layers,
what is deliberately deferred, and the known limitations worth fixing early.

For *normative rules*, see `docs/ai/*`. For orientation, see `docs/AI_HANDOFF.md`.
For backlog, see `docs/FUTURE_FEATURES.md`.

---

## 1. The one invariant

Everything serves one chain:

```
Ontology → Validation → API → Store → UI / OBD edge → Actions → Decisions
```

- **Ontology owns meaning.** If a fault class or role is not in
  `packages/ontology`, it does not exist.
- **Validation guards the gate.** Untrusted input (UI, obd-gateway) is Zod-
  validated before storage or action.
- **API exposes semantic contracts.** Reads through resource endpoints; state
  changes through action endpoints that go through `ActionService`.
- **Store holds validated facts** keyed by stable semantic IDs (`memory` or
  Postgres via `STORAGE_DRIVER`).
- **UI / obd-gateway visualize and report.** They never own fault meaning.
- **Actions → Decisions.** Mutations emit `DecisionRecord`s that preserve *why*.

If the software cannot say *what was observed, which fault class is proven, what
action is allowed, and why a recommendation was ranked* — it is not semantic yet.

Product-goal maturity + ideal solutions (work pieces):
[`FUTURE_FEATURES.md` § Product goals](FUTURE_FEATURES.md#product-goals-why-this-app-exists)
/ [Ideal solutions](FUTURE_FEATURES.md#ideal-solutions-by-goal).

---

## 2. Component map

```
apps/
  web-ui/         React 19 + TanStack Router/Query + Redux Toolkit + Tailwind v4
  api/            Fastify 5 + Zod + Store seam (memory | Postgres/Drizzle)
  obd-gateway/    Python + python-OBD → Observation batches

packages/
  ontology/       dl-ontology.json, vehicle-profiles, DTC dictionary, campaigns
  semantic-types/ shared camelCase types
  validation/     Zod input contracts
  logos-bridge/   Node ↔ LOGOS seam (+ FakeLogosBridge)
  cartridges/     perception + framing (generic + engine-family)
  game-theory/    pure decision/zero-sum/cooperative math
  api-client/     typed UI↔API bridge + TanStack queryKeys
```

Dependency direction (nothing points "up" toward an app):

```
semantic-types ← ontology ← validation
      ↑            ↑
      └──────── cartridges ──┘
        ↑
   logos-bridge
        ↑
     apps/api
apps/web-ui ← api-client ← semantic-types
apps/obd-gateway ← (HTTP only; no TS packages)
```

---

## 3. Data flow

```mermaid
flowchart TB
    subgraph edge [OBD edge]
        mx[OBDLink MX+]
        gw[obd-gateway]
        mx --> gw
    end
    subgraph api [apps/api]
        obs[ObservationsService]
        recog[RecognitionService]
        policy[PolicyService]
        solver[SolverService]
        actions[ActionService]
        obs --> recog
        recog --> actions
        policy --> actions
        solver --> actions
    end
    subgraph logos [metalanguage]
        eng[LOGOS realize / reason / solve / forecast]
    end
    ui[apps/web-ui]
    gw -->|POST observations| obs
    ui -->|HTTP| api
    recog --> logos
    policy --> logos
    solver --> logos
    api -->|DTOs| ui
```

**Never skip a layer:** `obd-gateway` does not call LOGOS. The UI does not write
the store. Handlers do not mutate state except via `ActionService`.

---

## 4. Ontology & multi-vehicle selection

| File | Role |
|---|---|
| `packages/ontology/dl-ontology.json` | DL TBox: classes, roles, views |
| `packages/ontology/vehicle-profiles.json` | Vehicle → engine family → view + cartridges |
| `packages/ontology/dtc-dictionary.json` | Curated DTC → description / concept |
| `packages/ontology/pid-dictionary.json` | Thin SAE J1979 seed: units + Mode 01 hex |
| `packages/ontology/known-campaigns.json` | W80 / W84 / TSB 05047457A matcher inputs |

**Views:**

- `generic` — SAE-common fault classes (misfire, lean, EVAP, cam/crank, oil trend)
- `fca-tigershark-2.4` — generic + `MultiAirOilStarvation`

`VehicleService` resolves a vehicle's engine family, which selects the TBox view
slice and the cartridge list. The 2003 Silverado 2500 HD uses
`veh:silverado-2500hd-2003` / `gm-vortec-6.0` with an inert
`gm-vortec-6.0-stub.ts` until curated GM TSBs exist — not forking the generic
TBox.

---

## 5. Cartridges

Each cartridge in `packages/cartridges` packages:

1. **Perception** — PID/DTC thresholds → ABox assertions (`hasDtc`, `hasCondition`, …)
2. **Framing** — proven class → `DiagnosticProblem` draft with `desiredState.successCriteria`
   and a ranked candidate-action playbook

Registered today: SAE generics (misfire, lean/rich, EVAP, catalyst, O2, EGR,
secondary air, cam/crank), `fca-tigershark-2.4`, plus inert `gm-vortec-6.0-stub`.
Catalog/cartridge parity is enforced by `pnpm lint:ontology` and
`packages/cartridges/src/ontology-lint.test.ts`.

---

## 6. API services

| Service | LOGOS primitive | Responsibility |
|---|---|---|
| `RecognitionService` | `realize` | Prove fault classes from observations; never synthesize "Healthy" |
| `PolicyService` | `reason` | Safety holds (e.g. forbid clear-codes-and-drive) |
| `SolverService` | `solve` | Rank diagnostic/repair actions |
| `ForecastService` | `forecast` / trend helpers | Multi-signal trends; optional `sessionId` scope (F4); oil/LTFT/load → recognition |
| `ActionService` | — | Sole mutation gate + `DecisionRecord` audit (+ knowledge-gap accept/dismiss) |
| `ObservationService` | — | Ingest batches; provenance; live gauges; retention prune |
| `DriveSessionService` | — | Start/end/list sessions; simulate upload path |
| `ReportService` | — | Markdown + print HTML diagnostic reports; last session + Learning section (F10) |
| `CampaignsService` | — | Match vehicle vs known recalls/TSBs |
| `RecommendationService` | — | Shortlist from proven classes + matched campaigns/TSBs (R5) |
| `LearningCycleService` | — | Compose LearningCycle read-model from problems/decisions/calibration (F9) |
| `KnowledgeGapService` | — | Detect/upsert knowledge-gap proposals; export patch hints (F11) |
| `VehicleService` | — | Profiles, engine families, view resolution |

**FOL atom sanitization:** LOGOS `reason` formula parsing rejects hyphens/colons
in individual IDs. `PolicyService` uses `folSafeAtom` to rewrite
`veh:jeep-renegade-2015-latitude` → `veh_jeep_renegade_2015_latitude` for
facts only (`realize` JSON ABoxes are unaffected).

---

## 7. API surface (current)

Resource reads:

- `GET /health`
- `GET /api/vehicles`, `POST /api/vehicles`, `GET /api/vehicles/:id`
- `GET /api/engine-families`
- `POST /api/vehicles/:id/observations` (202)
- `GET /api/vehicles/:id/{dtcs,freeze-frame,mode06,forecast,recognition,recommendations,campaigns,problems,decisions,export,sessions,observation-batches,report,case-timeline,learning-cycles,knowledge-gaps,cascade-prognosis}`
- `GET /api/vehicles/:id/forecast?sessionId=` — optional per-drive trend scope (F4)
- `GET /api/vehicles/:id/knowledge-gaps/export` — Markdown + JSON patch bundle (F11)
- `GET /api/vehicles/:id/export/{observations,dtcs,decisions,problems,timeline}.csv`
- `GET /api/garage/export` — full garage JSON dump
- `GET /api/problems/:id`, `GET /api/problems/:id/report`

Action / mutation:

- `POST /api/actions/create-diagnostic-problem`
- `POST /api/actions/solve-diagnostic-problem`
- `POST /api/actions/log-repair`
- `POST /api/actions/{start,end,simulate}-drive-session`
- `POST /api/vehicles/:id/observations/prune` — retention (keep evidence; downsample old PIDs)
- `POST /api/garage/import` — merge JSON dump (dedupe observation batches)
- `POST /api/vehicles/:id/actions/clear-codes-and-drive` (policy-gated)
- `POST /api/vehicles/:id/recommendations/refresh`
- `POST /api/recommendations/:id/status` — Zod-validated lifecycle status
- `POST /api/recommendations/:id/convert` — open case via ActionService + mark converted
- `POST /api/vehicles/:id/knowledge-gaps/refresh` — detect/upsert gap proposals (F11)
- `POST /api/knowledge-gaps/:id/status` — accept/dismiss via ActionService + DecisionRecord

No auth today. No OpenAPI export yet (garden has it; auto deferred).

---

## 8. UI

Routes (`apps/web-ui/src/router.tsx`):

| Path | Page |
|---|---|
| `/` | Dashboard — DTCs, recognition, oil trend, recommendations |
| `/diagnosis` | Proven classes, draft/solve problems, safety-hold demo |
| `/problems/$problemId` | Solution + ranked actions + log repair |
| `/campaigns` | Recall / TSB matcher |
| `/journal` | Decision records + JSON/CSV export & import |

Stack conventions match garden: TanStack Query for server state; Redux for
durable client UI (`selectedVehicleId`, `debugMode`). There is no shared
`@auto/ui-components` package yet — pages are self-contained.

---

## 9. OBD gateway

Python app (`apps/obd-gateway`) using `python-OBD` against ELM327-compatible
adapters (OBDLink MX+). Modes of interest: 01 (PIDs), 02 (freeze frame),
03/07/0A (DTCs), 06 (on-board monitors). CLI: `scan`, `watch`, `--simulate`,
`--manual-pid`, `--simulate-dtc`, `--dry-run`.

Normative rules: [`docs/ai/OBD_EDGE_CONTRACT.md`](ai/OBD_EDGE_CONTRACT.md).
Operator detail: [`apps/obd-gateway/README.md`](../apps/obd-gateway/README.md).

---

## 10. Testing & CI

- TypeScript: Vitest per package (`pnpm -r test`) — includes API HTTP smoke
  (`apps/api/src/app.smoke.test.ts`) and ontology Zod/registry parity
- Lint/format: Biome (`pnpm lint`) — see `docs/ai/CODE_STANDARDS.md`
- Python: pytest (`pnpm obd-gateway:test`)
- Ontology: `pnpm lint:ontology` (LOGOS well-formedness + narrow parity vitest);
  healthcheck uses `--wellformed-only` after `pnpm -r test` already covered parity
- Real-LOGOS smoke: `packages/logos-bridge/src/*-integration.test.ts` — self-skip
  without LOGOS; CI runs them for real only in the `ontology-lint` job
  (`verify` deliberately omits the LOGOS install)
- Bridge-drift (advisory): `pnpm check:bridge-drift` vs garden-architect's `@garden/logos-bridge`
- One-shot local gate: `pnpm healthcheck` (typecheck∥biome + tests + well-formedness +
  gateway + UI build + drift check; auto-sets `LOGOS_PYTHON_BIN` to `.venv` when present)
- CI: `.github/workflows/ci.yml` — `verify` (Fake path) + `ontology-lint` (real LOGOS)

Unit tests that need LOGOS behavior without Python inject `FakeLogosBridge`.
Required layers are listed in `docs/ai/TESTING_DEV_GUIDE.md`.

---

## 11. Deliberately deferred

See [`FUTURE_FEATURES.md`](FUTURE_FEATURES.md) — especially **Product goals**.
High-level gaps vs a complete garage product:

- Live MX+ dry-run validation (S1); Bluetooth discovery (S6)
- Live MX+ watch → auto-link batches to open DriveSession
- OBD/CAN log import adapters (ELM, candump, MF4) — `obdlog-v1` + ELM327 AT/session text + JSON batches shipped; native candump/MF4 still deferred
- Auth / multi-user; shared UI package; LLM advise loop; full Silverado cartridge
