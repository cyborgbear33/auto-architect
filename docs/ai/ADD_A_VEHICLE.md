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

The stub already exists:

- Vehicle: `veh:silverado-tbd` in `vehicle-profiles.json`
- Family: `gm-ecotec3-tbd` (view `generic`, generic cartridges only)
- Cartridge: `packages/cartridges/src/gm-ecotec3-stub.ts` (inert)

### 1. Confirm the real engine

Research year/trim/VIN → actual engine family (EcoTec3 5.3/6.2, Duramax, etc.)
and documented DTCs/TSBs.

### 2. Fill the vehicle profile

Update `veh:silverado-tbd` (or add `veh:silverado-YYYY-trim`) with year, trim,
protocol notes, and the final `engineFamily` id.

### 3. OEM ontology (only if needed)

If GM-specific fault classes are required:

1. Add classes/subtypes to `dl-ontology.json`
2. Create view `gm-ecotec3-…` listing generic + OEM classes
3. Point the engine family at that view
4. Prove with a realize fixture

If SAE-generic classes suffice, keep view `generic`.

### 4. Fill the cartridge

Replace the stub's no-op perception/framing with real rules. Mirror
`fca-tigershark-2.4.ts` structure. Register framing `requires.classes` honestly.

### 5. Campaigns / DTC dictionary

Add GM campaigns and DTC rows as curated facts — do not invent TSB numbers.

### 6. Verify

```bash
pnpm lint:ontology
pnpm -r test
# optional live path:
pnpm dev:api
# POST simulated observations for the new vehicle id
```

### 7. UI

VehicleSwitcher lists API vehicles automatically. No UI fork required unless you
add OEM-specific pages (prefer not to).

## Checklist

- [ ] Profile has real year/trim/engine family
- [ ] View membership correct
- [ ] Cartridge registered on that family
- [ ] Ontology lint green
- [ ] At least one realize fixture or recognition test for the headline fault
- [ ] `FUTURE_FEATURES.md` updated (Silverado row → Implemented when done)
