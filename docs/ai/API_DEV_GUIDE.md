# API_DEV_GUIDE.md

Rules for `apps/api` (Fastify).

## Shape

```
src/
  server.ts / app.ts / config.ts
  routes/index.ts          ← HTTP only: parse, call service, return
  services/*.ts            ← business logic
  store/{index,memory,seed}.ts
  lib/{errors,bridge-errors,ids}.ts
```

Handlers stay thin. Services own behavior. The store is swappable later
(`memory` today; Postgres planned).

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
| `ForecastService` | optional / helpers | Oil-level trend |
| `ActionService` | via other services | Sole mutation + DecisionRecord |
| `ObservationsService` | no | Append / query batches |
| `CampaignsService` | no | Match `known-campaigns.json` |
| `RecommendationsService` | no (uses recognition outputs) | List / refresh / status |
| `VehicleService` | no | Profiles + engine-family resolution |

Inject `LogosBridge` (or `FakeLogosBridge` in tests) from `services/index.ts`.

## Validation

Parse external bodies with `@auto/validation` Zod schemas:

- `ObservationBatchSchema`
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

## Ports & CORS

Default listen: `4100`. web-ui Vite proxies `/api` and `/health`. Keep CORS
permissive for local MVP; tighten when auth lands.
