# ADD_A_CARTRIDGE.md

## What a cartridge is

A **cartridge** is a self-contained diagnostic-domain extension that teaches the
system a new family of situations — **without touching LOGOS, the bridge, or
core services.** It lives in `packages/cartridges` and bundles:

- **perception** — rules that turn PID/DTC observations into DL assertions
- **framing** — rules that turn a *recognized class* into a `DiagnosticProblem`
  draft with a candidate-action playbook

Meaning still lives in `@auto/ontology`. A cartridge only *references* those
names; ontology-lint enforces that it can never require a class the TBox does
not declare.

## Cartridges today

| Cartridge | Scope |
|---|---|
| `misfire` | SAE-generic P0300–P0304 + load |
| `lean-fuel` | P0171 / P0174 + fuel trim |
| `rich-fuel` | P0172 / P0175 + negative fuel trim |
| `evap` | P0442 / P0455 / P0456 |
| `catalyst` | P0420 / P0430 (DTC-only) |
| `o2-sensor` | Upstream + downstream circuit/performance/heater + Mode 06 |
| `egr` | P0400–P0406 + Mode 06 EGR OBDMID $31 |
| `secondary-air` | P0410–P0412 + Mode 06 AIR OBDMID $71 |
| `cam-crank-correlation` | P0016–P0018 family |
| `fca-tigershark-2.4` | MultiAir oil starvation (OEM view) |
| `gm-vortec-6.0-stub` | Inert A5 extension for 2003 Silverado 2500 HD (SAE cartridges load separately) |

## The recipe

### 1. Define meaning in `@auto/ontology`

Add subtypes/classes/roles to `dl-ontology.json`, put human notes in `notes`,
and add the class to the correct **view** (`generic` vs engine-family). Add DTC
rows to `dtc-dictionary.json` when codes are involved.

Prove with LOGOS before wiring:

```bash
python3 -m logos realize packages/ontology/fixtures/<your_fixture>.json --json
```

### 2. Write `packages/cartridges/src/<name>.ts`

Follow existing modules (`misfire.ts` is the best generic template;
`fca-tigershark-2.4.ts` is the OEM template).

Required framing fields:

- `statement` (`currentState` / `desiredState` / `gap`)
- `desiredState.successCriteria` + `measurement` — **required** or `solve` returns `clarify-values`
- `actions[]` with impact/cost/risk/confidence-style factors
- `requires.classes` listing every concept/class you touch

### 3. Register it

Append to `packages/cartridges/src/registry.ts` and list the cartridge name in
the appropriate `engineFamilies.*.cartridges` array in `vehicle-profiles.json`
(generic SAE cartridges should appear on every family that needs them).

### 4. Test

- Perception unit tests (`perception.test.ts` patterns)
- `pnpm lint:ontology` (catalog/cartridge parity)
- Optional: API recognition test with `FakeLogosBridge` realizer

### 5. Document

- Add a short note to `FUTURE_FEATURES.md` Implemented History when shipping
- If the cartridge is non-trivial, add a focused `docs/ai/<NAME>_CARTRIDGE.md`
  (optional; garden does this for large domains)

## Guidelines that make the solver behave

- Prefer a cheap, reversible, high-infoGain probe when the cause is ambiguous
- Keep OEM-specific pre-checks in the OEM cartridge (e.g. oil level before
  blaming MultiAir — TSB 05047457A)
- Do not put Jeep-only thresholds into `misfire.ts`
