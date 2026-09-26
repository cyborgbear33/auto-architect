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
`EvapPurgeSystemFault`, `EvapVentSystemFault`,
`CatalystEfficiencyBank1/2`, `O2CircuitFaultBank1/2`,
`O2PerformanceFaultBank1/2`, `O2HeaterFaultBank1/2`,
`O2DownstreamCircuit/Performance/HeaterFaultBank1/2`,
`EgrFlowFault`, `EgrCircuitFault`, `SecondaryAirSystemFault`,
`CoolantThermostatFault`, `EctSensorCircuitFault`,
`IgnitionCoilCircuitFault`, `InjectorCircuitFault`, `MapSensorFault`,
`KnockSensorCircuitFault`, `ThrottlePositionSensorFault`,
`ChronicOilConsumption`, `MultiAirOilStarvation` (FCA view only). Full list:
`packages/ontology/dl-ontology.json` `classes` (36 total).

**Symptom / condition / trend subtypes:** see `dl-ontology.json` subtypes —
notably `EgrFlowCode`, `EgrCircuitCode`, `SecondaryAirCode`,
`O2Downstream*`, Mode 06 `Failed*` Conditions, fuel-trim/load Trends.

**Object / record types (`@auto/semantic-types`):** `VehicleProfile`,
`DtcObservation`, `PidReading`, `DiagnosticProblem`, `DiagnosticSolution`,
`Recommendation`, `DecisionRecord`.

**Engine families:** `fca-tigershark-2.4`, `gm-vortec-6.0` (SAE set + inert stub).

---

## 3. Hard Rules

1. **Never synthesize a "Healthy" class** when recognition is undecided. Undecided
   means insufficient evidence — not wellness.
2. **Never classify in `obd-gateway`.** It posts observations only.
3. **Never write `DiagnosticProblem`/decision/special-procedure/knowledge-gap
   state outside `ActionService`.** (Other domains — vehicles, observations,
   discovery, drive sessions, recommendations — legitimately write through
   their own service; see [`API_DEV_GUIDE.md`](API_DEV_GUIDE.md) "Mutation gate".)
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
10. **Keep `packages/logos-bridge` a thin shim — never re-fork transport
    here.** It has no `bridge.ts` / `serve-client.ts` / `errors.ts` of its
    own; those live once, in `software-architect`'s `@seam/logos-bridge`,
    depended on via `file:` in `packages/logos-bridge/package.json`. This
    package should only ever contain `src/index.ts` (the re-export) plus
    domain `*-integration.test.ts` fixtures. Run `pnpm check:bridge-drift`
    (advisory) if you touch this package — it fails loudly if forked
    transport files reappear. See [`TESTING_DEV_GUIDE.md`](TESTING_DEV_GUIDE.md).

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
6. Refine the Mastery Guide if the new profile changes hardware, protocol,
   troubleshooting, or operator workflow (see [`UX_GUIDELINES.md`](UX_GUIDELINES.md)
   §4 “Keep the Mastery Guide current”).

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
- Before finishing meaningful work: `pnpm healthcheck --full` green (day-to-day: `pnpm healthcheck`).

See [`TESTING_DEV_GUIDE.md`](TESTING_DEV_GUIDE.md) for the required-layer matrix.
