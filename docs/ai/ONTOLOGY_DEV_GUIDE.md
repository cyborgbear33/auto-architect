# ONTOLOGY_DEV_GUIDE.md

How meaning is defined in `@auto/ontology`.

## Files

| File | Purpose |
|---|---|
| `dl-ontology.json` | DL TBox: subtypes, roles, classes, views, notes |
| `vehicle-profiles.json` | Vehicles + engine families → view + cartridge list |
| `dtc-dictionary.json` | Curated DTC → description / semantic concept |
| `known-campaigns.json` | Recalls / TSBs (W80, W84, MultiAir TSB, …) |
| `fixtures/*.json` | Hand-built realize / reason proofs for LOGOS |

Typed accessors live in `packages/ontology/src/index.ts`. Domain lint lives in
`src/lint.ts` (`lintOntology` / `runOntologyLint`).

## LOGOS schema constraints

- Class objects must match LOGOS `Ontology` schema — **do not** put free-form
  `comment` fields inside `classes.*`. Human notes go in top-level `notes`.
- Prefer equivalence definitions (`equivalentTo`) for fault classes, matching
  garden's style (`Thirsty ≡ …`).
- Views are named slices of classes. Engine families point at a view.

## Roles (current)

- `hasDtc` — Engine → Symptom
- `hasCondition` — Engine → Condition
- `hasTrend` — Engine → Trend

Add a role only when a real perception edge needs it; keep the role set small.

## Views & multi-vehicle

- `generic` — SAE-common classes
- `fca-tigershark-2.4` — generic + `MultiAirOilStarvation`

OEM-specific classes belong in an OEM view, not in `generic`, unless they are
truly SAE-portable.

## DTC dictionary discipline

- Every concept referenced by the dictionary should exist in the TBox (or be a
  clearly non-class annotation — prefer class-linked concepts).
- `pnpm lint:ontology` fails on catalog ↔ DL ↔ cartridge drift.
- Prefer real TSB/recall grounding over inventing descriptions.
- Ground SAE-generic codes in SAE J2012 / ISO 15031-6 wording; never guess
  manufacturer-enhanced meanings. See [`HARDWARE_STANDARDS.md`](HARDWARE_STANDARDS.md).

## Proving a class before wiring UI

```bash
# After editing dl-ontology.json / a fixture:
python3 -m logos ontology packages/ontology/dl-ontology.json --json
python3 -m logos realize packages/ontology/fixtures/misfire_realize_fixture.json --json
python3 -m logos reason  packages/ontology/fixtures/misfire_reason_fixture.json --json
```

Only after realize/reason behave as intended should you wire cartridge framing
or UI copy.

## Registry schemas

`vehicle-profiles.json`, `dtc-dictionary.json`, and `known-campaigns.json` are
Zod-validated (`packages/ontology/src/schemas.ts`). `runOntologyLint` also
checks engineFamily → ontology view → registered cartridge name wiring.
`tsc` alone does **not** prove registry shape — always keep lint green.

## Lint

```bash
pnpm lint:ontology                  # well-formedness + narrow parity vitest
pnpm lint:ontology --wellformed-only
pnpm lint:ontology --check          # soft-skip well-formedness if logos missing; still run parity
```

Runs:

1. LOGOS well-formedness (`logos ontology --json`) — unless `--wellformed-only`
   skipped logos under `--check`, or healthcheck already covered parity
2. Narrow TypeScript parity: `@auto/ontology` `lint.test.ts` + `fixtures.test.ts`,
   `@auto/cartridges` `ontology-lint.test.ts` (not the full package suites)
