import type { Cartridge } from "./types.ts";

/**
 * GM Vortec 6.0L (LQ4-class) stub for the 2003 Silverado 2500 HD (A5).
 *
 * The truck profile already loads the full SAE-generic cartridge set. This
 * cartridge stays inert — no perception/framing, no invented GM-enhanced
 * classes — until curated LQ4/GMT800 TSBs or OEM procedures are added.
 *
 * Activation checklist (do not skip):
 * 1. Confirm VIN / RPO engine code (LQ4 vs other 6.0 variants) if available.
 * 2. Cite public GM TSB / service-manual summaries for any OEM-enhanced codes.
 * 3. Add GM-specific classes to dl-ontology.json behind a `gm-vortec-6.0` view
 *    (mirror `fca-tigershark-2.4`), never into the generic view unless SAE-portable.
 * 4. Fill this cartridge's perception/framing (mirror fca-tigershark-2.4.ts).
 * 5. Keep vehicle id `veh:silverado-2500hd-2003` pointed at this family.
 */
export const gmVortec60StubCartridge: Cartridge = {
  name: "gm-vortec-6.0-stub",
  perception: [],
  framing: [],
  requires: { classes: [] },
};
