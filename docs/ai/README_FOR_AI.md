# README_FOR_AI.md

> **New here / picking the project up?** Read **`docs/AI_HANDOFF.md`** first — the
> single cross-project orientation (what the system is, how the LOGOS engine in
> `../metalanguage` connects, current status, and how to continue). This file is
> the coding-rules read order to consult once you start editing.
>
> **Learning the architecture as a course?** Read
> **`docs/LESSON_AGENT_DETERMINISTIC_APPS.md`** (pointer) → full lesson in
> `metalanguage/docs/LESSON_AGENT_DETERMINISTIC_APPS.md` (theory, workshop,
> garden as worked example). Then apply the domain swap described in the
> auto-architect handoff.
>
> For feature planning and backlog hygiene, also use **`docs/FUTURE_FEATURES.md`**
> as the canonical planned-feature reference.

## Read Order for AI Assistants

Before making changes, read files in this order:

1. `docs/ai/GLOBAL_DEV_GUIDE.md`
2. `docs/ai/AI_CODING_RULES.md`
3. `docs/ai/CODE_STANDARDS.md` — TS strictness, Biome, `pnpm healthcheck` DoD
4. `docs/ai/ONTOLOGY_DEV_GUIDE.md`
5. Domain-specific guide for the change:
   - `UI_DEV_GUIDE.md` — technical/architectural rules for the web-ui
   - `UX_GUIDELINES.md` — design/usability standard (IA, evidence, trust). Read before ANY web-ui page/component change
   - `API_DEV_GUIDE.md` — Fastify routes, ActionService gate
   - `OBD_EDGE_CONTRACT.md` — OBD-II / CANBUS edge rules (read before touching `apps/obd-gateway`)
   - `HARDWARE_STANDARDS.md` — SAE/ISO/CAN grounding (J1979, J2012, UDS, J1939)
   - `ADD_A_CARTRIDGE.md` — recipe for a new diagnostic domain
   - `ADD_A_VEHICLE.md` — recipe for a new vehicle / engine family
   - `TESTING_DEV_GUIDE.md` — FakeLogosBridge, vitest, pytest
   - `DOCUMENTATION_DEV_GUIDE.md` — when creating or reformatting any doc

For feature-building work (new capabilities), read this too:

- `docs/FUTURE_FEATURES.md` — add newly proposed features, and when a feature is
  implemented move it out of the planned backlog and into implemented history.

## Before Coding

1. Identify the concept (fault class, DTC, PID, campaign, action, decision).
2. Reuse ontology / cartridge / semantic-type names — do not invent parallel vocabularies.
3. Prefer extending cartridges over special-casing Jeep in generic code.
4. Keep `obd-gateway` observation-only.
5. Route mutations through `ActionService`.
6. Add or update tests; run `pnpm lint:ontology` if ontology or cartridges changed.
7. Update `FUTURE_FEATURES.md` when shipping or proposing capabilities.
