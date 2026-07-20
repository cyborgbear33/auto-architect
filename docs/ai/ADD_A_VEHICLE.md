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

Profile already filled for the gas 2500 HD:

- Vehicle: `veh:silverado-2500hd-2003` — 2003 Chevrolet Silverado 2500 HD, unleaded 6.0L V8
- Family: `gm-vortec-6.0` (view `generic`, full SAE cartridge set)
- Cartridge: `packages/cartridges/src/gm-vortec-6.0-stub.ts` (inert OEM extension)

### 1. Confirm the real engine (optional polish)

Confirm RPO / VIN sticker (LQ4-class Vortec 6000 vs other 6.0 variants) when
convenient. Do not invent EcoTec3 or Duramax for this gas truck.

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

If SAE-generic classes suffice, keep view `generic` (current state).

### 4. Fill the cartridge

Replace the stub's no-op perception/framing with curated GM rules only when
TSBs / service-manual summaries exist. Mirror `fca-tigershark-2.4.ts`.

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
   possible. **Today the gateway posts Mode 01 PIDs + Mode 03/07 DTCs**; Mode 06
   / freeze-frame richness is API+UI-ready but still an edge backlog — do not
   expect a shop-tool-complete Mode 06 dump from `scan` alone yet.

Wrong vehicle id = evidence lands on the wrong profile. Empty honest scan ≠
“healthy” — it means nothing measured.

## Checklist

- [x] Profile has real year/trim/engine family (2003 2500 HD / Vortec 6.0)
- [x] View membership correct (`generic` until OEM classes exist)
- [x] Cartridge registered on that family (inert stub)
- [ ] Ontology lint green after any OEM fill
- [ ] At least one realize fixture for a truck-specific headline fault (when OEM cartridge filled)
- [ ] `FUTURE_FEATURES.md` updated (OEM cartridge row → Implemented when done)
