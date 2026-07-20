# Auto-Architect

LOGOS-powered car diagnostics: an ontology-first vehicle diagnostics system for a 2015 Jeep Renegade Latitude (2.4L Tigershark), built generically enough to add other vehicles (e.g. a Chevrolet Silverado) later. It mirrors [garden-architect](../garden-architect)'s architecture exactly — the LOGOS reasoning engine and the propose/dispose seam are reused unchanged; only the ontology, cartridges, and UI are rewritten for the automotive domain.

**The one-line thesis:** obd-gateway reports validated OBD-II evidence (PIDs/DTCs); LOGOS (`realize`/`reason`/`solve`/`forecast`) verifies which fault class is actually proven, resolves safety policy (e.g. "don't clear codes and drive with an active misfire"), and ranks the next best diagnostic/repair action — never a guess dressed up as certainty.

## Architecture

```
apps/obd-gateway (Python)  --POST Observations-->  apps/api (Fastify)  <--HTTP-->  apps/web-ui (React)
                                                          |
                                                          v
                                              packages/logos-bridge
                                                          |
                                                          v
                                        metalanguage/engine (LOGOS, unmodified)
```

- **`apps/obd-gateway`** (Python + python-OBD): talks to an OBDLink MX+ (or any ELM327-compatible adapter) directly over Bluetooth/USB. Reads standard Mode 01 PIDs and Mode 03/07 DTCs, tags them with a vehicle profile id, and POSTs `Observation` batches to the API. Never classifies anything itself.
- **`apps/api`** (Fastify + TypeScript): the deterministic core. `RecognitionService` turns observations into ABox facts and calls LOGOS `realize` to prove fault classes (never synthesizes a fake "Healthy"). `PolicyService` calls `reason` for real safety holds. `SolverService` calls `solve` to rank next actions. `ActionService` is the single mutation gate — every state change goes through it, with an audit trail (`DecisionRecord`).
- **`apps/web-ui`** (React 19 + Vite + TanStack Router/Query + Redux Toolkit + Tailwind): vehicle picker, live DTC/PID dashboard, a Diagnosis page that drafts/solves `DiagnosticProblem`s and demonstrates the safety-hold policy gate, a recall/TSB matcher, and a decision journal.
- **`packages/ontology`**: the DL TBox (`dl-ontology.json`) — SAE-generic fault classes (misfire, lean fuel, EVAP leak, cam/crank correlation) in a `generic` view, plus an engine-family-specific view (`fca-tigershark-2.4`) for MultiAir oil-starvation. A vehicle-profile registry (`vehicle-profiles.json`) maps each vehicle to an engine family, which selects both the ontology view and the cartridges to load. Also owns a curated DTC dictionary and known campaigns (TSB 05-047-457A, recalls W80/W84).
- **`packages/cartridges`**: perception rules (PID/DTC → ABox assertions) and framing rules (proven class → `DiagnosticProblem` draft with a ranked action playbook). Generic cartridges apply to every vehicle; `fca-tigershark-2.4.ts` only loads for that engine family. `gm-ecotec3-stub.ts` is a deliberately inert stub proving a second vehicle (e.g. a Silverado) needs zero changes to the base TBox or generic cartridges.
- **`packages/logos-bridge`**: the Node↔Python seam to the LOGOS engine (`@auto/logos-bridge`), ported unchanged from garden-architect's `@garden/logos-bridge`. Ships a `FakeLogosBridge` for Python-free unit tests.
- **`packages/semantic-types`** / **`packages/validation`**: the shared camelCase vocabulary and Zod input contracts every app speaks.
- **`packages/game-theory`**: pure, dependency-free game-theory core (decision/zero-sum/cooperative analysis) used by `solve`'s ranking, ported unchanged from garden-architect.

## Getting started

```bash
pnpm install                 # also runs scripts/setup-solver.mjs --check
pnpm dev:api                 # Fastify API on :4100 (memory store by default, seeded Jeep)
pnpm dev:ui                  # Vite dev server on :5173 (proxies /api, /health to :4100)

# Optional durable storage (survives tsx watch restarts):
pnpm infra:up                # Postgres on :5433
DATABASE_URL=postgres://auto:auto@localhost:5433/auto pnpm dev:api:postgres
```

Feed it evidence without any hardware, via obd-gateway's simulate mode:

```bash
pnpm obd-gateway:install
cd apps/obd-gateway && ../../.venv/bin/python3 -m obd_gateway \
  --vehicle-id veh:jeep-renegade-2015-latitude --simulate \
  --manual-pid ENGINE_LOAD=85 --simulate-dtc P0304:stored scan
```

Then open http://localhost:5173 — the Dashboard should show DTC `P0304` and the proven `MisfireUnderLoad` fault class; the Diagnosis page lets you draft/solve a `DiagnosticProblem` and demonstrates the `clear-codes-and-drive` safety hold actually blocking.

## Testing

```bash
pnpm healthcheck             # one-shot: typecheck + biome + tests + ontology + gateway + UI build
# or discrete:
pnpm -r typecheck            # every TS package/app
pnpm lint                    # Biome format/lint
pnpm -r test                 # every TS package/app (vitest)
pnpm obd-gateway:test        # Python (pytest)
pnpm lint:ontology           # LOGOS well-formedness + catalog/cartridge parity (hard-fails; requires LOGOS)
```

CI (`.github/workflows/ci.yml`) runs typecheck, Biome, tests, ontology lint, and a production build of the web UI.

## Documentation

| Doc | Use |
|---|---|
| [`docs/AI_HANDOFF.md`](docs/AI_HANDOFF.md) | **Start here** — orientation for humans and AI agents |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | As-built service graph and contracts |
| [`docs/FUTURE_FEATURES.md`](docs/FUTURE_FEATURES.md) | Canonical backlog (planned ↔ implemented) |
| [`docs/ai/README_FOR_AI.md`](docs/ai/README_FOR_AI.md) | Coding-rules read order |
| [`docs/ai/OBD_EDGE_CONTRACT.md`](docs/ai/OBD_EDGE_CONTRACT.md) | OBD-II / CANBUS edge rules |
| [`docs/ai/HARDWARE_STANDARDS.md`](docs/ai/HARDWARE_STANDARDS.md) | SAE/ISO/CAN grounding (J1979, J2012, UDS, J1939) |
| [`docs/ai/CODE_STANDARDS.md`](docs/ai/CODE_STANDARDS.md) | TS / Biome / `pnpm healthcheck` |
| [`docs/LESSON_AGENT_DETERMINISTIC_APPS.md`](docs/LESSON_AGENT_DETERMINISTIC_APPS.md) | Pointer to the metalanguage lesson |

Guidance is layered: shared propose/dispose fundamentals → auto product guides → OBD/hardware standards.

## Adding a second vehicle (e.g. a Silverado)

See [`docs/ai/ADD_A_VEHICLE.md`](docs/ai/ADD_A_VEHICLE.md). Short version:

1. Research the real engine family (e.g. EcoTec3 5.3L) and its documented fault codes/TSBs.
2. Add any engine-family-specific DL classes to `packages/ontology/dl-ontology.json` behind a new view (mirror `fca-tigershark-2.4`).
3. Fill in `packages/cartridges/src/gm-ecotec3-stub.ts`'s perception/framing rules (mirror `fca-tigershark-2.4.ts`).
4. Add the vehicle + engine family to `packages/ontology/vehicle-profiles.json`.
5. Run `pnpm lint:ontology` — it will catch any class the cartridge references that the ontology doesn't declare.

No changes to the generic TBox, generic cartridges, API services, or UI are required.

## Repository

https://github.com/cyborgbear33/auto-architect
