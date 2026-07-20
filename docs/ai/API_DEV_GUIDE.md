# API_DEV_GUIDE.md

Rules for `apps/api` (Fastify).

## Shape

```
src/
  server.ts / app.ts / config.ts
  routes/index.ts          ← HTTP only: parse, call service, return
  services/*.ts            ← business logic
  store/{index,memory,drizzle,seed}.ts
  db/{schema,client}.ts    ← Drizzle schema (Postgres adapter only)
  lib/{errors,bridge-errors,ids}.ts
```

Handlers stay thin. Services own behavior. The store is swappable via
`STORAGE_DRIVER` (`memory` | `postgres` | `auto`). Services never branch on the
driver — they depend only on the `Store` interface.

## Mutation gate

All state changes that matter go through `ActionService`:

- `createDiagnosticProblem`
- `solveDiagnosticProblem`
- `logRepair`
- `requestClearCodesAndDrive` (policy-checked)

Do **not** write problems/decisions from a route handler or from
`RecognitionService`. Recognition is read-side classification.

Observations are ingested via `ObservationsService.record` (edge ingest is
allowed to append evidence; it still does not classify).

## Service responsibilities

| Service | May call LOGOS? | Notes |
|---|---|---|
| `RecognitionService` | `realize` | Never invent "Healthy" |
| `PolicyService` | `reason` | Use `folSafeAtom` for individual ids |
| `SolverService` | `solve` | Requires `desiredState.successCriteria` on problems |
| `ForecastService` | optional / helpers | Multi-signal trends (`summary`); oil + LTFT + load → realize |
| `ActionService` | via other services | Sole mutation + DecisionRecord |
| `ObservationService` | no | Append / query batches; provenance; live gauges; retention prune |
| `DriveSessionService` | no | Start/end/list; simulate session with linked batches |
| `ReportService` | no | Markdown + print HTML reports (vehicle / problem) |
| `SolutionHistoryService` | no | Roll up repair outcomes by action / class / family |
| `CaseTimelineService` | no | Derive case narrative from problems + decisions |
| `GarageExportService` | no (import mutates store) | JSON garage dump/restore + CSV tables |
| `CampaignService` | no | Match `known-campaigns.json` |
| `RecommendationService` | no (uses recognition outputs) | List / refresh / status |
| `VehicleService` | no | Profiles + engine-family resolution |

Inject `LogosBridge` (or `FakeLogosBridge` in tests) from `services/index.ts`.

## Validation

Parse external bodies with `@auto/validation` Zod schemas:

- `ObservationBatchSchema` (optional `sessionId`)
- `StartDriveSessionSchema` / `EndDriveSessionSchema` / `SimulateDriveSessionSchema`
- `CreateDiagnosticProblemSchema`
- `LogRepairSchema`
- `CreateVehicleSchema`

Do not trust path `vehicleId` alone for observation identity — the schema
should align with the path id (routes currently merge path id into the body).

## Errors

- Use `AppError` / helpers in `lib/errors.ts` for not-found / conflict / policy
- Map bridge failures via `lib/bridge-errors.ts` (`LogosNotAvailableError`,
  `LogosTimeoutError`, `LogosSchemaError`, …)
- Policy blocks should surface a stable, UI-readable code/message — not a raw
  Fastify JSON parse failure

## Adding an endpoint

1. Decide: resource read vs action mutation.
2. Add Zod schema if body is external.
3. Implement / extend a service method.
4. Register in `routes/index.ts`.
5. Add a service unit test with `FakeLogosBridge` when LOGOS is involved.
6. Update `ARCHITECTURE.md` surface table if the public contract changed.

## Storage drivers

| `STORAGE_DRIVER` | Behavior |
|---|---|
| `memory` (default) | In-memory maps; resets on process restart. Used by unit/smoke tests. |
| `postgres` | Drizzle adapter; requires `DATABASE_URL`. Runs migrations in `store.init()`. |
| `auto` | Postgres when `DATABASE_URL` is set, otherwise memory. |

```bash
pnpm infra:up                 # docker compose Postgres on :5433 (avoids garden on :5432)
pnpm db:generate              # after schema changes
DATABASE_URL=postgres://auto:auto@localhost:5433/auto pnpm dev:api:postgres
```

Store conformance: `apps/api/src/store/store.test.ts` always covers memory;
set `DATABASE_URL` to also run the Postgres suite.

## Ports & CORS

Default listen: `4100`. web-ui Vite proxies `/api` and `/health`. Keep CORS
permissive for local MVP; tighten when auth lands.
