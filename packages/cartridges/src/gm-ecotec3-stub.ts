import type { Cartridge } from "./types.ts";

/**
 * A deliberate stub proving the multi-vehicle extension point (A5).
 *
 * The Silverado profile already loads the full SAE-generic cartridge set
 * (misfire/lean/rich/EVAP/catalyst/O2/EGR/secondary-air/…). This cartridge
 * stays inert — no perception/framing, no invented GM classes — until a real
 * truck exists.
 *
 * Activation checklist (do not skip):
 * 1. Confirm year/trim/VIN + exact engine (EcoTec3 5.3/6.2, Duramax, …).
 * 2. Cite public GM TSB / service-manual summaries for any OEM-enhanced codes.
 * 3. Add GM-specific classes to dl-ontology.json behind a `gm-ecotec3-*` view
 *    (mirror `fca-tigershark-2.4`), never into the generic view.
 * 4. Fill this cartridge's perception/framing (mirror fca-tigershark-2.4.ts).
 * 5. Rename `gm-ecotec3-tbd` → real family id in vehicle-profiles.json.
 */
export const gmEcotec3StubCartridge: Cartridge = {
  name: "gm-ecotec3-stub",
  perception: [],
  framing: [],
  requires: { classes: [] },
};
