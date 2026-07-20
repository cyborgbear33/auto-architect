# TESTING_DEV_GUIDE.md

## Commands

```bash
pnpm healthcheck             # one-shot summary of everything below
pnpm healthcheck --fast      # skip obd-gateway lint/tests + web-ui build
pnpm -r typecheck
pnpm lint                    # Biome check
pnpm -r test                 # all TS packages/apps (vitest)
pnpm lint:ontology           # LOGOS well-formedness + narrow catalog/cartridge parity
pnpm lint:ontology --wellformed-only   # logos ontology --json only (healthcheck uses this)
pnpm lint:ontology --check   # soft-skip well-formedness if logos missing; still run parity
pnpm obd-gateway:lint        # Ruff check + format --check
pnpm obd-gateway:test        # pytest
pnpm --filter @auto/web-ui build
pnpm check:bridge-drift      # advisory: logos-bridge vs garden-architect's copy
```

CI (`.github/workflows/ci.yml`):

| Job | What |
|---|---|
| `verify` | typecheck, biome, `pnpm -r test` (Fake/self-skip LOGOS), web-ui build, Ruff + pytest — **no** LOGOS install |
| `ontology-lint` | install LOGOS → hard `pnpm lint:ontology` → logos-bridge real-engine tests |

## Required test layers

When you change a seam, cover the matching layer. Docs alone are not enough —
CI + `pnpm healthcheck` enforce these.

| Layer | Where | When required |
|---|---|---|
| **Unit (FakeLogosBridge)** | `apps/api/src/services/*.test.ts`, package `*.test.ts` | Any service / cartridge / bridge unit logic |
| **Ontology parity (Python-free)** | `@auto/ontology` lint + Zod registries; `@auto/cartridges` `ontology-lint.test.ts` | Ontology JSON, DTC dictionary, vehicle profiles, cartridge `requires` / names |
| **Real-LOGOS smoke** | `packages/logos-bridge/src/*-integration.test.ts` | Wire contract, fixtures, `LOGOS_MIN_ENGINE_VERSION` bumps |
| **HTTP smoke** | `apps/api/src/app.smoke.test.ts` (`buildApp` + `inject`) | Route registration / `buildApp` / seed wiring |
| **Gateway (pytest)** | `apps/obd-gateway/tests/` | Edge payload, CLI, pid_map |
| **UI (RTL, mocked api)** | `apps/web-ui/src/__tests__/` | Page interaction; never invent fault classes client-side |

**Not required yet:** coverage % thresholds (deferred until Postgres / shared UI packages land). Prefer honest layers over a vanity number.

## Healthcheck steps

1. **typecheck ∥ biome** (parallel)
2. **`pnpm -r test`** (includes ontology parity, API smoke, logos-bridge integration if logos is on `LOGOS_PYTHON_BIN`)
3. **`pnpm lint:ontology --wellformed-only`** — unique LOGOS `ontology --json` gate (parity already covered by step 2)
4. **obd-gateway Ruff** (skipped with `--fast` or missing `.venv`)
5. **obd-gateway pytest** (skipped with `--fast` or missing `.venv`)
6. **web-ui build** (skipped with `--fast`)
7. **bridge-drift** (advisory only)

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

When you touch the wire contract (`types.ts`, `bridge.ts`, `serve-client.ts`)
or bump `LOGOS_MIN_ENGINE_VERSION`, these are the tests that actually prove it
still works end-to-end — treat a failure here as more serious than a
FakeLogosBridge unit-test failure.

## Keeping `@auto/logos-bridge` in sync with `@garden/logos-bridge`

`packages/logos-bridge`'s transport/salvage logic (`bridge.ts`,
`serve-client.ts`, `errors.ts`) is a domain-agnostic seam shared in spirit
with garden-architect's `@garden/logos-bridge`. When you fix a real bug or add
an engine-protocol feature on one side, port it to the other.

`pnpm check:bridge-drift` (also run — advisory-only — as the last
`pnpm healthcheck` step) diffs those seam files against a garden-architect
checkout next to this repo and reports structural drift. It never fails CI
(the sibling repo usually isn't checked out there); it exists so a human
notices divergence instead of discovering it during the next LOGOS upgrade.
See `scripts/check-bridge-drift.mjs` for exactly what it does and does not
detect.

## What "green" means

Before merging meaningful changes, prefer:

```bash
pnpm healthcheck
```

Or equivalently:

1. `pnpm -r typecheck`
2. `pnpm lint`
3. `pnpm -r test`
4. `pnpm lint:ontology` if ontology/cartridges touched (or `--wellformed-only` if parity already ran)
5. `pnpm obd-gateway:test` if gateway touched
