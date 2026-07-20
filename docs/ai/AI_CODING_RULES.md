# AI_CODING_RULES.md

## AI Coding Rules for Ontology-Driven Vehicle Diagnostics

This project is ontology-first.

The ontology is the source of domain meaning for the store, API, UI, OBD gateway,
cartridges, policy rules, and future AI assistant.

Do not invent domain concepts casually.

Do not treat the UI, store, or adapter firmware as the source of truth.

The ontology owns meaning.

---

## 1. Prime Directive

Before writing or modifying code, identify what kind of thing is being changed:

- fault class / DL class
- symptom / condition / trend subtype
- role (`hasDtc`, `hasCondition`, `hasTrend`)
- vehicle profile / engine family
- DTC dictionary entry
- campaign (recall / TSB)
- observation (PID, DTC, freeze frame, Mode 06)
- diagnostic problem / action
- recommendation
- decision record
- UI view
- OBD gateway payload

Then reuse existing ontology concepts wherever possible.

Correct development order:

1. Understand the real-world meaning (SAE code, TSB procedure, symptom).
2. Reuse or define the ontology concept (and view membership).
3. Add validation (`@auto/validation`) if the input is external.
4. Add cartridge perception/framing and/or API/UI/gateway implementation.
5. Add tests (prefer `FakeLogosBridge` in TS unit tests).
6. Run `pnpm lint:ontology` when ontology or cartridges changed.
7. Update documentation / `FUTURE_FEATURES.md` when needed.

Do not begin by adding random fields, DTOs, or React props without checking
semantic meaning.

---

## 2. Core Concepts to Reuse

Prefer these before inventing new ones:

**Fault classes (DL):** `MisfireUnderLoad`, `CamCrankCorrelationFault`,
`LeanFuelBank1/2`, `RichFuelBank1/2`, `EvapLeakSmall/Large`,
`CatalystEfficiencyBank1/2`, `O2CircuitFaultBank1/2`, `O2HeaterFaultBank1/2`,
`ChronicOilConsumption`, `MultiAirOilStarvation` (FCA view only).

**Symptom / condition / trend subtypes:** `CylinderMisfire`, `CamCrankCorrelation`,
`LeanCodeBank1/2`, `RichCodeBank1/2`, `EvapCodeSmall/Large`,
`CatalystCodeBank1/2`, `O2CircuitBank1/2`, `O2HeaterBank1/2`, `MultiAirFault`,
`HighLoad`, `PositiveFuelTrim`, `NegativeFuelTrim`, `LowOilPressure`,
`FailedCatalystMonitorBank1/2`, `FailedEvapMonitorSmall/Large`,
`FailedO2HeaterMonitorBank1/2`, `FailedMisfireMonitor`,
`OilLevelDecline`, `RisingFuelTrim`, `FallingFuelTrim`, `RecurringHighLoad`.

**Object / record types (`@auto/semantic-types`):** `VehicleProfile`,
`DtcObservation`, `PidReading`, `DiagnosticProblem`, `DiagnosticSolution`,
`Recommendation`, `DecisionRecord`.

**Engine families:** `fca-tigershark-2.4`, `gm-ecotec3-tbd` (stub).

---

## 3. Hard Rules

1. **Never synthesize a "Healthy" class** when recognition is undecided. Undecided
   means insufficient evidence — not wellness.
2. **Never classify in `obd-gateway`.** It posts observations only.
3. **Never mutate store state outside `ActionService`.**
4. **Never hardcode Jeep into generic SAE cartridges.** Put OEM-specific logic in
   an engine-family cartridge + ontology view.
5. **Always set `desiredState.successCriteria`** on framed problems, or LOGOS
   `solve` returns `clarify-values` instead of ranking actions.
6. **Sanitize FOL individuals for `reason`** (`folSafeAtom`) — hyphens/colons break
   the LOGOS formula parser. Do not "fix" this by changing semantic IDs.
7. **Keep logos-bridge the only snake_case boundary.**
8. **Do not skip ontology lint** after changing classes, views, DTC concepts, or
   cartridge `requires`.
9. **Ground DTC/PID meaning in real standards** (SAE J1979 / J2012, ISO 15031,
   cited TSBs) — never invent descriptions. See
   [`HARDWARE_STANDARDS.md`](HARDWARE_STANDARDS.md).
10. **Keep `packages/logos-bridge` in sync with garden-architect's copy.**
    `bridge.ts` / `serve-client.ts` / `errors.ts` are a shared, domain-agnostic
    seam by design — port real fixes/protocol changes both ways. Run
    `pnpm check:bridge-drift` (advisory) when you touch these files. See
    [`TESTING_DEV_GUIDE.md`](TESTING_DEV_GUIDE.md).
    **Intentional (not drift):** `DiagnosticSolution` vs `GardenSolution` (and
    their `@auto` / `@garden` semantic-types imports); multi-vehicle vs
    multi-bed wording in comments; ontology-lint JSDoc (engine-family vs
    Plant-taxon). Everything else in those three files should stay
    behaviorally identical after a sync pass.

---

## 4. Propose / Dispose

If you add an LLM or heuristic advisor later:

- It may *propose* diagnoses, problem drafts, or repair candidates.
- LOGOS (`realize` / `reason` / `solve`) *disposes* — verifies, forbids, ranks.
- The advisor must not write trusted state except through ActionService APIs.
- Mirror garden-architect's agent-service pattern; do not invent a second bridge.

---

## 5. Multi-vehicle discipline

Adding a vehicle is an extension, not a fork:

1. Research real engine family + TSBs.
2. Add/adjust DL classes behind a view if OEM-specific.
3. Implement or fill the engine-family cartridge.
4. Register the vehicle + family in `vehicle-profiles.json`.
5. Run `pnpm lint:ontology`.

See [`ADD_A_VEHICLE.md`](ADD_A_VEHICLE.md).

---

## 6. Testing expectations

- API service logic: unit test with `FakeLogosBridge`.
- Route / `buildApp` changes: keep `apps/api/src/app.smoke.test.ts` green.
- Cartridges: perception tests + ontology-lint integration test (classes + names).
- Ontology registries: Zod shape + engineFamily → view → cartridge wiring via
  `runOntologyLint` (never invent DTC/PID meanings — see HARDWARE_STANDARDS).
- Gateway: pytest with fakes (no hardware required).
- UI: React Testing Library; mock `api` module; await async finds.
- Prefer failing closed on safety holds.
- Before finishing meaningful work: `pnpm healthcheck` green.

See [`TESTING_DEV_GUIDE.md`](TESTING_DEV_GUIDE.md) for the required-layer matrix.
