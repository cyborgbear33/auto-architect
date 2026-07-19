# FUTURE_FEATURES.md

This is the canonical **future-feature backlog** for `auto-architect`.
Use it when selecting new work. Keep it current as features are planned and delivered.

## How to use this file

- Use this document as the first stop when asking "what should we build next?"
- Add new candidate features here as they are discovered.
- Keep each feature scoped as a capability, not a task list.
- Link implemented features to the docs that now describe them.

## Maintenance rules (required)

When implementing a feature:

1. Move it from **Planned Backlog** to **Implemented History**.
2. Add:
   - implementation PR/commit reference (if available),
   - primary guide/docs path,
   - brief note on where it lives in code.
3. If a feature is fully shipped and documented elsewhere, remove it from Planned Backlog.

When proposing a new feature:

1. Add it to **Planned Backlog** with a short "why now" note.
2. Include the likely system seams it reuses (ontology, bridge, solver, cartridges, obd-gateway, etc.).
3. Keep prioritization honest: update priority and status fields, do not leave stale entries.

---

## Planned Backlog

| Feature | Status | Priority | Why now | Likely reuse seams |
|---|---|---|---|---|
| Postgres persistence for vehicles, observations, problems, decisions | planned | high | In-memory store resets on every `tsx watch` restart; blocks real drive logging and repair history. | `apps/api/src/store`, garden's Drizzle/Postgres patterns |
| Durable observation history + freeze-frame retention | planned | high | Needed for trend/forecast credibility and post-repair verification. | `ObservationsService`, Mode 01/02/03 batches |
| Shared `@auto/ui-components` (status pills, empty/error states, evidence panels) | planned | medium | Prevents per-page inventing of trust/evidence UI; matches garden. | `UX_GUIDELINES`, Diagnosis/Dashboard patterns |
| Live OBDLink MX+ dry-run (scan/watch → Dashboard) | planned | high (operator validation) | Catches adapter/port/path issues CI never sees; validate Jeep path before deep feature work. | `apps/obd-gateway`, Dashboard, real adapter |
| Port logos-bridge seam drift vs garden (one-time sync pass) | planned | medium (preliminary) | `pnpm check:bridge-drift` already flags structural drift — port intentional transport/salvage fixes both ways before they diverge further. | `packages/logos-bridge`, garden `@garden/logos-bridge`, `scripts/check-bridge-drift.mjs` |
| Live gauge view (RPM, load, fuel trim, coolant) with units | planned | high (operator UX) | Dashboard today is DTC/recognition-first; operators expect live PIDs during a drive. | `ObservationsService` latest PIDs, web-ui Dashboard |
| Mode 06 monitor results UI | planned | medium | API already exposes `/mode06`; UI does not surface it. | `GET /api/vehicles/:id/mode06` |
| Freeze-frame detail panel next to misfire/load evidence | planned | medium | Freeze-frame is half the story for `MisfireUnderLoad`. | `GET .../freeze-frame`, Diagnosis/ProblemDetail |
| OpenAPI 3.1 export from Fastify | planned | low | Garden has it; useful for external tooling once the surface stabilizes. | `apps/api` route registration |
| Auth / single-user local identity (optional JWT) | planned | low until multi-user | MVP is single-operator on a trusted LAN; add before any network exposure. | garden `AuthService` patterns — keep optional |
| Propose-only LLM agent loop (advise pass) | planned | medium | Garden's agent-service pattern: LLM proposes, LOGOS disposes. Not needed for OBD correctness. | `@auto/logos-bridge`, cartridges framing, new `apps/agent-service` |
| Verbalize plain-English proof traces on Diagnosis / ProblemDetail | planned | medium | Bridge/`verbalize` exists in LOGOS; UI currently shows class names more than narration. | logos-bridge `verbalize`, RecognitionService |
| Confidence calibration from logged repair outcomes | planned | medium | `log-repair` already records outcomes; feed them back into playbook confidence. | `ActionService.logRepair`, RecommendationsService |
| Expand DTC dictionary beyond Tigershark seed set | planned | medium | Curated dictionary is seed-sized; more P0xxx coverage improves perception mapping. | `dtc-dictionary.json`, ontology lint parity |
| Comprehensive SAE/ISO-grounded PID & DTC knowledge base (full J1979 PID table + broad generic P/B/C/U DTC coverage) | planned | high | Vital shared knowledge base for operators *and* ontology/perception; large undertaking — land guidance + quality gates first (`HARDWARE_STANDARDS.md`), then seed curated tables without inventing meanings. | `dtc-dictionary.json`, `pid_map.py`, ontology lint, `HARDWARE_STANDARDS.md` |
| Fill GM EcoTec3 / Silverado engine-family cartridge | planned | high when truck available | Stub proves the extension point; real DTCs/TSBs needed before claiming support. | `gm-ecotec3-stub.ts`, `vehicle-profiles.json`, new DL view if needed |
| SAE J1939 heavy-duty CAN support (PGN model) | planned | low | Distinct bus architecture from passenger OBD; only if a class-3+ diesel vehicle is added. | new edge path / ontology view — do not stretch Mode 01 cartridges |
| Bluetooth auto-discovery / preferred adapter profile for OBDLink MX+ | planned | medium | Manual port config works; discovery reduces friction on laptop + phone docks. | `obd_gateway/config.py`, `client.py` |
| Continuous drive session recorder (watch → session object) | planned | medium | `watch` posts batches; a first-class DriveSession would group them for journals. | obd-gateway watch, ObservationsService, Journal UI |
| Android/companion read-only client | planned | low | Nice for under-hood use; web-ui first. | API read endpoints only |
| Export diagnostic report (Markdown / print-to-PDF) | planned | medium | Compose recognition + ranked actions + decisions into a shareable shop note. | DecisionRecord, verbalize, Journal |
| Extract a real shared `@seam/logos-bridge-core` package instead of two hand-synced copies | planned | low | `pnpm check:bridge-drift` is an advisory reminder, not a fix — a real shared package would remove the sync burden entirely once both apps' bridge needs stabilize. | `packages/logos-bridge`, garden-architect's `@garden/logos-bridge`, `scripts/check-bridge-drift.mjs` |
| Coverage thresholds (vitest coverage / codecov) | planned | low | Deferred until Postgres + shared UI packages land — prefer honest test-layer matrix over vanity %. | `TESTING_DEV_GUIDE.md`, CI |
| Policy library expansion (e.g. forbid clear-codes under LowOilPressureStallRisk) | planned | medium | Only clear-codes-and-drive + misfire is wired as the demo hold. Start with one additional reason fixture so the safety-hold pattern isn't a one-off. | `PolicyService`, reason fixtures, `packages/ontology/fixtures` |
| Ontology browser page (read-only TBox / views / DTC dictionary) | planned | low | Useful for debugging; garden has a full Ontology page — keep auto's lighter. | `@auto/ontology` loaders, new route |
| Multi-vehicle comparison dashboard | planned | low | Only valuable once ≥2 real vehicles exist. | VehicleSwitcher, recognition summaries |

---

## Implemented History

| Feature | When | Where / docs |
|---|---|---|
| Sibling monorepo scaffold (pnpm, tsconfig, editable LOGOS setup) | 2026-07 | root `package.json`, `scripts/setup-solver.mjs` |
| SAE-generic DL ontology + FCA Tigershark view | 2026-07 | `packages/ontology/dl-ontology.json`, `ONTOLOGY_DEV_GUIDE.md` |
| Vehicle profile registry (Jeep + Silverado stub) | 2026-07 | `vehicle-profiles.json`, `ADD_A_VEHICLE.md` |
| Realize + reason Python fixtures (misfire / safety hold) | 2026-07 | `packages/ontology/fixtures/*` |
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
| Shared `@auto/api-client` (typed fetch, ApiError, queryKeys; web-ui migrated) | 2026-07 | `packages/api-client`, `API_CLIENT_DEV_GUIDE.md`, `apps/web-ui/src/lib/api.ts` |
| Thin SAE PID/DTC seed (cartridge + DEFAULT_PIDS units/hex; P0019) | 2026-07 | `pid-dictionary.json`, `dtc-dictionary.json`, `HARDWARE_STANDARDS.md`, gateway `test_pid_seed.py` |
| Ruff lint/format for `obd-gateway` (wired into healthcheck + CI) | 2026-07 | `apps/obd-gateway/pyproject.toml`, `pnpm obd-gateway:lint`, `CODE_STANDARDS.md` |

---

## Explicit non-goals (for now)

- Reverse-engineering proprietary FCA enhanced diagnostics / AlfaOBD session cloning
- Direct ECU flashing or bi-directional actuator control from this app
- Replacing a professional scan tool for dealer-level guided procedures
- Multi-tenant SaaS before local single-operator durability exists
