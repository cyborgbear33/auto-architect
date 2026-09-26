# TESTING_DEV_GUIDE.md

## Commands

```bash
pnpm healthcheck             # one entry point — sanity (default)
pnpm healthcheck --full      # complete DoD (+ gateway + UI build)
pnpm healthcheck --fast      # alias for sanity
pnpm -r typecheck
pnpm lint                    # Biome check
pnpm -r test                 # all TS packages/apps (vitest)
pnpm lint:ontology           # LOGOS well-formedness + narrow catalog/cartridge parity
pnpm lint:ontology --wellformed-only   # logos ontology --json only (healthcheck uses this)
pnpm lint:ontology --check   # soft-skip well-formedness if logos missing; still run parity
pnpm obd-gateway:lint        # Ruff check + format --check
pnpm obd-gateway:test        # pytest
pnpm --filter @auto/web-ui build
pnpm check:bridge-drift      # advisory: logos-bridge vs software-architect seam
```

CI (`.github/workflows/ci.yml`):

| Job | What |
|---|---|
| `verify` | typecheck, biome, `pnpm -r test` (Fake/self-skip LOGOS), web-ui build, Ruff + pytest — **no** LOGOS install |
| `ontology-lint` | install LOGOS → hard `pnpm lint:ontology` → logos-bridge real-engine tests |

## Required test layers

When you change a seam, cover the matching layer. Docs alone are not enough —
CI + `pnpm healthcheck --full` enforce these.

| Layer | Where | When required |
|---|---|---|
| **Unit (FakeLogosBridge)** | `apps/api/src/services/*.test.ts`, package `*.test.ts` | Any service / cartridge / bridge unit logic |
| **Ontology parity (Python-free)** | `@auto/ontology` lint + Zod registries; `@auto/cartridges` `ontology-lint.test.ts` | Ontology JSON, DTC dictionary, vehicle profiles, cartridge `requires` / names |
| **Real-LOGOS smoke** | `packages/logos-bridge/src/*-integration.test.ts` | Wire contract, fixtures, `LOGOS_MIN_ENGINE_VERSION` bumps |
| **HTTP smoke** | `apps/api/src/app.smoke.test.ts` (`buildApp` + `inject`) | Route registration / `buildApp` / seed wiring |
| **Store conformance** | `apps/api/src/store/store.test.ts` | Always memory; Postgres when `DATABASE_URL` is set |
| **Gateway (pytest)** | `apps/obd-gateway/tests/` | Edge payload, CLI, pid_map |
| **UI (RTL, mocked api)** | `apps/web-ui/src/__tests__/` | Page interaction; never invent fault classes client-side |

**Not required yet:** coverage % thresholds (deferred until Postgres / shared UI packages land). Prefer honest layers over a vanity number.

## Healthcheck steps

**Sanity (default `pnpm healthcheck`):**

1. **typecheck ∥ biome ∥ tests ∥ ontology well-formedness** (all parallel)
2. **bridge-drift** (advisory only)

**Full (`pnpm healthcheck --full`)** adds, after sanity:

3. **obd-gateway Ruff** (skipped if `.venv` missing)
4. **obd-gateway pytest** (skipped if `.venv` missing)
5. **web-ui build**

Parity vitest already runs under `pnpm -r test`; the ontology step is the unique
LOGOS `ontology --json` gate.

If `LOGOS_PYTHON_BIN` is unset and `.venv/bin/python3` exists, healthcheck sets
`LOGOS_PYTHON_BIN` to that path automatically (same Python obd-gateway uses).

## TypeScript

- Prefer **unit tests next to the code** (`*.test.ts` / `*.test.tsx`)
- API services that touch LOGOS: inject `FakeLogosBridge` with custom
  realizer/reasoner/solver stubs
- Do not require a live LOGOS process for package unit tests
- Keep garden's habit: test the mutation gate and policy fail-closed paths
- Route / `buildApp` changes: keep `app.smoke.test.ts` green

## FakeLogosBridge

```ts
import { FakeLogosBridge } from "@auto/logos-bridge";

const bridge = new FakeLogosBridge(
  undefined,          // solve
  realizer,           // realize
  undefined,          // forecast
  undefined,          // verbalize
  reasoner,           // reason
);
```

Use default fakes for "no entailment" cases; inject functions when asserting
specific class membership or `Forbid(...)` outcomes.

## Web UI

- jsdom + Testing Library
- `vi.mock` the API module
- Use `vi.hoisted` for error classes referenced inside mocks
- Prefer `findBy*` and `within(...)` for async / duplicate text

## Python (obd-gateway)

- pytest with fake connection / fake HTTP session doubles
- CLI tests cover `--dry-run` and `--simulate` (no hardware)
- Keep tests free of real Bluetooth adapters

## Ontology / fixtures

Real LOGOS proofs live under `packages/ontology/fixtures/`. When changing the
TBox, still run them by hand to iterate quickly:

```bash
python3 -m logos realize packages/ontology/fixtures/misfire_realize_fixture.json --json
python3 -m logos reason  packages/ontology/fixtures/misfire_reason_fixture.json --json
python3 -m logos reason  packages/ontology/fixtures/oilstarvation_reason_fixture.json --json
```

Registry shape is Zod-validated (`packages/ontology/src/schemas.ts`) and
`runOntologyLint` checks engineFamily → view → cartridge-name wiring. Fixture
file presence is asserted in `packages/ontology/src/fixtures.test.ts`.

## Real-LOGOS integration tests (the CI smoke)

`packages/logos-bridge/src/{realize,reason,schema}-integration.test.ts` load
the SAME checked-in fixtures above and run them through the real
`createLogosBridge()` — no fake, no CLI-by-hand — asserting the exact
`RealizeResult` / `ReasonResult` shape the API services depend on. Each file
self-skips (`describe.skipIf(!available)`) when `python3 -m logos --help`
fails, so:

- **Locally**: they run for free whenever you have LOGOS installed (part of
  `pnpm -r test` / `pnpm --filter @auto/logos-bridge test`).
- **In CI**: only the `ontology-lint` job installs LOGOS and runs these for
  real (the `verify` job deliberately omits the install so they self-skip).

When the wire contract changes upstream (in `@seam/logos-bridge` /
`software-architect`) or `LOGOS_MIN_ENGINE_VERSION` bumps, these are the tests
that actually prove it still works end-to-end — treat a failure here as more
serious than a FakeLogosBridge unit-test failure.

## Keeping `@auto/logos-bridge` a thin shim over `@seam/logos-bridge`

`packages/logos-bridge` holds no transport code of its own anymore —
`src/index.ts` is purely a re-export of `@seam/logos-bridge`
(`file:../../../software-architect/packages/logos-bridge`), plus the
domain-specific `*-integration.test.ts` fixtures in this repo. There is no
`bridge.ts` / `serve-client.ts` / `errors.ts` here to keep in sync with a
garden-architect fork — that transport now lives once, in
`software-architect`, and both garden-architect and auto-architect depend on
it the same way.

`pnpm check:bridge-drift` (also run — advisory-only — as the last
`pnpm healthcheck` step) confirms the `@seam/logos-bridge` dependency is
present and that no forked transport files (`bridge.ts`, `fake.ts`,
`types.ts`, `errors.ts`, `serve-client.ts`) have crept back into this
package. It never fails CI (the `software-architect` sibling checkout may not
be present); it exists so a human notices a regression instead of
discovering it later. See `scripts/check-bridge-drift.mjs` for exactly what
it checks.

## What "green" means

Day-to-day:

```bash
pnpm healthcheck
```

Before merging meaningful changes:

```bash
pnpm healthcheck --full
```
Or equivalently:

1. `pnpm -r typecheck`
2. `pnpm lint`
3. `pnpm -r test`
4. `pnpm lint:ontology` if ontology/cartridges touched (or `--wellformed-only` if parity already ran)
5. `pnpm obd-gateway:test` if gateway touched
