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
```

CI runs the same set in `.github/workflows/ci.yml` (`verify` + `ontology-lint`).

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

Real LOGOS proofs live under `packages/ontology/fixtures/`. Run them manually
(or via `pnpm lint:ontology`'s well-formedness step) when changing the TBox:

```bash
python3 -m logos realize packages/ontology/fixtures/misfire_realize_fixture.json --json
python3 -m logos reason  packages/ontology/fixtures/misfire_reason_fixture.json --json
```

A fuller real-LOGOS CI smoke job is backlog (`FUTURE_FEATURES.md`).

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
