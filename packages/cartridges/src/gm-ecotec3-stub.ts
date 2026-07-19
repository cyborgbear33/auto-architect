import type { Cartridge } from "./types.ts";

/**
 * A deliberate stub proving the multi-vehicle extension point: adding a
 * Chevrolet Silverado (or any GM EcoTec3-family vehicle) does NOT require
 * touching the base TBox or any generic cartridge. This cartridge is
 * intentionally inert (no perception/framing rules, no new DL classes — a
 * cartridge may reference classes, never define them) until real GM PIDs/DTCs
 * are researched and verified for the actual truck once it's acquired.
 *
 * To activate: research the truck's real engine (e.g. EcoTec3 5.3L/6.2L or
 * Duramax), add any GM-specific fault classes to dl-ontology.json behind a
 * new `gm-ecotec3-*` view (mirroring `fca-tigershark-2.4`), fill in this
 * cartridge's perception/framing rules (mirroring fca-tigershark-2.4.ts), and
 * point the vehicle's `engineFamily` at the real id in vehicle-profiles.json.
 */
export const gmEcotec3StubCartridge: Cartridge = {
  name: "gm-ecotec3-stub",
  perception: [],
  framing: [],
  requires: { classes: [] },
};
