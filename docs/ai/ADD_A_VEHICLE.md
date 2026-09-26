# ADD_A_VEHICLE.md

How to add a second vehicle (e.g. Chevrolet Silverado) without rewriting the
generic SAE base.

## Principle

Vehicles select **engine families**. Engine families select:

1. an ontology **view**
2. a list of **cartridges**

Do not fork `MisfireUnderLoad` per manufacturer. Add OEM-specific classes only
when the fault is not SAE-portable (MultiAir is the canonical example).

## Recipe (Silverado path)

Profile filled and VIN-confirmed for the gas 2500 HD:

- Vehicle: `veh:silverado-2500hd-2003` — 2003 Chevrolet Silverado 2500 HD, LQ4
  Iron 6.0L V8 (Vortec 6000), 4WD, GVWR Class 2H — confirmed via NHTSA vPIC
  VIN decode, see `OEM_RESEARCH_SOURCES.md`
- Family: `gm-vortec-6.0` (view `generic`, full SAE cartridge set)
- Cartridge: `packages/cartridges/src/gm-vortec-6.0-stub.ts` — partially filled:
  re-frames `KnockSensorCircuitFault` and `LeanFuelBank1`/`LeanFuelBank2` with
  GM-specific TSB guidance; everything else on this engine family still runs
  the plain SAE-generic framing

### 1. Confirm the real engine (done)

Confirmed via VIN decode (not just RPO sticker guess): LQ4 Iron 6.0L V8. Not
LQ9/L18/other 6.0 variant. Do not invent EcoTec3 or Duramax for this gas truck.

### 2. Fill the vehicle profile

Year/trim/notes are set. Update `obdProtocol` only after a live ELM327 session
reports which protocol auto-detect selected (GMT800 gas often J1850 VPW — do
not hard-force CAN).

### 3. OEM ontology (only if needed)

If GM-specific fault classes are required:

1. Add classes/subtypes to `dl-ontology.json`
2. Create view `gm-vortec-6.0` listing generic + OEM classes
3. Point the engine family at that view
4. Prove with a realize fixture

If SAE-generic classes suffice, keep view `generic` (current state — the knock
sensor and lean-fuel fill below needed no new class, just a higher-priority
framing rule on the classes that already existed).

### 4. Fill the cartridge

Replace the stub's no-op perception/framing with curated GM rules only when
TSBs / service-manual summaries exist. Mirror `fca-tigershark-2.4.ts` if a new
dedicated class is warranted; if the DTCs already have a generic class (as
with knock sensor / lean fuel), it's simpler to just add a higher-priority
`framing` rule for that same `whenClass` — `draftForClass` in `registry.ts` is
winner-take-all by priority, so the OEM-specific `build` fully replaces the
generic one rather than merging with it. See `gm-vortec-6.0-stub.ts` for the
worked example.

### 5. Campaigns / DTC dictionary

Add GM campaigns and DTC rows as curated facts — do not invent TSB numbers.

### 6. Verify

```bash
pnpm lint:ontology
pnpm -r test
# optional live path:
pnpm dev:api
# POST simulated observations for veh:silverado-2500hd-2003
```

### 7. UI

VehicleSwitcher lists API vehicles automatically. No UI fork required unless you
add OEM-specific pages (prefer not to).

## Live OBD scan (operator path)

Full human manual (MX+ + Jeep gray adapter + phased integration plan):
[`../OPERATOR_OBD_MANUAL.md`](../OPERATOR_OBD_MANUAL.md).

For a more complete picture when an adapter is plugged in:

1. Start API (`pnpm dev:api` or Postgres variant). Open the UI and select the
   correct vehicle (`veh:silverado-2500hd-2003` or the Jeep).
2. Pair/connect the ELM327 / OBDLink; leave `AUTO_OBD_PROTOCOL` unset so the
   adapter auto-detects (important on 2003 GMT800).
3. From `apps/obd-gateway`, run one-shot or drive logging with the **same**
   vehicle id the UI is showing:

   ```bash
   python -m obd_gateway --vehicle-id veh:silverado-2500hd-2003 scan
   # or during a drive:
   python -m obd_gateway --vehicle-id veh:silverado-2500hd-2003 watch --interval 5
   ```

4. Refresh Dashboard / Diagnosis — recognition runs on posted observations
   (proven classes, gauges, recommendations).
5. Optional richer inputs today: `--manual-pid` for non-standard keys the
   gateway cannot read; odometer / oil notes via UI where available.
6. For monitor / Mode 06 depth: drive until readiness monitors complete when
   possible. The gateway posts Mode 01 PIDs, Mode 03/07 DTCs, Mode 02 freeze
   frame (when present), and Mode 06 rows for seeded OBDMIDs the ECU supports —
   not every manufacturer TID label.

Wrong vehicle id = evidence lands on the wrong profile. Empty honest scan ≠
“healthy” — it means nothing measured.

## Checklist

- [x] Profile has real year/trim/engine family (2003 2500 HD, VIN-confirmed LQ4)
- [x] View membership correct (`generic` — knock sensor / lean fuel are already
      SAE-generic classes; no new GM-specific class or view was needed)
- [x] Cartridge filled — `gm-vortec-6.0-stub.ts` re-frames `KnockSensorCircuitFault`
      and `LeanFuelBank1`/`LeanFuelBank2` (priority 90, above the generic
      cartridges' 52/80) citing TSBs 02-06-04-023A and 05-06-04-029A
      (`sourceType: "corroborated"` — see `OEM_RESEARCH_SOURCES.md`)
- [x] Ontology lint green after the OEM fill (`pnpm lint:ontology`)
- [x] Proof the fill actually takes effect: no new DL realize fixture was
      needed (no new class), so proof lives at the cartridge layer instead —
      `gm-vortec-6.0-stub.test.ts` asserts `draftForClass` picks the GM-specific
      build over the generic one for a Silverado, and not for a Jeep
- [x] `FUTURE_FEATURES.md` updated (moved to Implemented History, 2026-09)
- [x] Mastery Guide refined — `VEHICLE_OBD_MASTERY_GUIDE.md`'s ontology-slice
      section no longer calls this cartridge an inert "GM stub"

Still open for a future pass: no GM-specific DL class exists yet (only two
generic classes got OEM-specific framing), and the two TSBs above are
`"corroborated"` not `"primary"` — see `OEM_RESEARCH_SOURCES.md`'s known
blockers if you want to try upgrading them. Do not restore the earlier
overclaims: 023A does not list 2003 or P0327, and 029A does not name
P0171/P0174 or a coolant leak.
