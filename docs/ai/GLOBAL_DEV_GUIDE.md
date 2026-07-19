# GLOBAL_DEV_GUIDE.md

## Purpose

This project is an ontology-first vehicle diagnostics system.

The system must support:

- React UI
- TypeScript API
- semantic ontology registry (DL TBox + vehicle profiles)
- OBD-II edge ingestion (OBDLink MX+ / ELM327)
- observations (PIDs, DTCs, freeze frames, Mode 06)
- recognition (LOGOS `realize`)
- safety policy (LOGOS `reason`)
- ranked diagnostic actions (LOGOS `solve`)
- recommendations + decision journal
- multi-vehicle extension via engine families
- future AI agents (propose-only)

The ontology owns domain meaning. The store holds facts. The API exposes semantic
contracts. The UI visualizes and acts on semantic objects. The OBD gateway
reports validated observations only. Future agents must operate only through
approved API actions.

## Required Stack

Use:

- pnpm workspaces
- TypeScript
- Vite
- React 19
- TanStack Router
- TanStack Query
- Redux Toolkit only for durable UI/app state
- Tailwind CSS
- Fastify
- Zod
- Vitest + React Testing Library
- Python 3 + `python-OBD` for `apps/obd-gateway`
- LOGOS from sibling `metalanguage` (editable / pinned pip install)
- `@auto/logos-bridge` as the only Node↔Python seam

Do not use:

- Next.js for MVP
- GraphQL for MVP
- agents that call LOGOS directly
- direct device-to-store writes
- UI-owned domain meaning
- untyped OBD payloads
- AlfaOBD/proprietary reverse engineering as a required path
- inventing a parallel "Healthy" fault class when recognition is undecided

## Monorepo Shape

```text
apps/
  web-ui/
  api/
  obd-gateway/

packages/
  ontology/
  semantic-types/
  validation/
  logos-bridge/
  cartridges/
  game-theory/

docs/
  ai/
```

## Layer Rules

1. **Ontology first** — meaning lives in `packages/ontology`.
2. **Cartridges extend domains** — perception + framing only; no engine changes.
3. **API is the semantic customs checkpoint** — Zod at the edge; ActionService for writes.
4. **OBD gateway posts observations only** — never classifies, never ranks.
5. **UI asks the API** — never invents fault classes client-side.
6. **Bridge is the only LOGOS wire** — camelCase in-app; snake_case only inside logos-bridge.
7. **Documentation sync** — when behavior changes, update the matching `docs/ai/*` guide and `FUTURE_FEATURES.md` in the same change when practical.

## Ports (defaults)

| App | Port |
|---|---|
| API | `4100` |
| web-ui (Vite) | `5173` |

Garden-architect uses `4000` for its API — keep auto on `4100` so both can run locally.

## Documentation Synchronization Rule

If you change a public contract (route, observation shape, ontology class, cartridge
`requires`, CLI flag), update the relevant guide in the same PR/commit when
practical. Wrong docs are worse than missing docs.
