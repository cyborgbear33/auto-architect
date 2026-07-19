# TESTING_DEV_GUIDE.md

## Commands

```bash
pnpm healthcheck             # one-shot summary of everything below
pnpm healthcheck --fast      # skip obd-gateway tests + web-ui build
pnpm -r typecheck
pnpm lint                    # Biome check
pnpm -r test                 # all TS packages/apps (vitest)
pnpm lint:ontology           # LOGOS well-formedness + catalog/cartridge parity
pnpm obd-gateway:test        # pytest
pnpm --filter @auto/web-ui build
pnpm check:bridge-drift      # advisory: logos-bridge vs garden-architect's copy
```

CI runs the same set in `.github/workflows/ci.yml` (`verify` + `ontology-lint`,
the latter now also running the real-LOGOS `logos-bridge` integration tests
below — not just the ontology well-formedness/parity checks its name implies).

## TypeScript

- Prefer **unit tests next to the code** (`*.test.ts` / `*.test.tsx`)
- API services that touch LOGOS: inject `FakeLogosBridge` with custom
  realizer/reasoner/solver stubs
- Do not require a live LOGOS process for package unit tests
- Keep garden's habit: test the mutation gate and policy fail-closed paths

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
```

## Real-LOGOS integration tests (the CI smoke)

`packages/logos-bridge/src/{realize,reason,schema}-integration.test.ts` load
the SAME checked-in fixtures above and run them through the real
`createLogosBridge()` — no fake, no CLI-by-hand — asserting the exact
`RealizeResult` / `ReasonResult` shape the API services depend on. Each file
self-skips (`describe.skipIf(!available)`) when `python3 -m logos --help`
fails, so:

- **Locally**: they run for free whenever you have LOGOS installed (part of
  `pnpm -r test` / `pnpm --filter @auto/logos-bridge test`).
- **In CI**: the `ontology-lint` job (the only job with LOGOS installed) runs
  `pnpm --filter @auto/logos-bridge test` with `LOGOS_PYTHON_BIN: python`
  right after the hard-fail ontology lint step — so they always execute for
  real in CI, not just skip. This is what catches `@auto/logos-bridge` <->
  engine wire drift that `FakeLogosBridge`-based unit tests cannot see.

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
4. `pnpm lint:ontology` if ontology/cartridges touched
5. `pnpm obd-gateway:test` if gateway touched
