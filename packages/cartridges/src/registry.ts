import { getEngineFamilyCartridges } from "@auto/ontology";
import { camCrankCorrelationCartridge } from "./cam-crank-correlation.ts";
import { catalystCartridge } from "./catalyst.ts";
import { egrCartridge } from "./egr.ts";
import { evapCartridge } from "./evap.ts";
import { fcaTigershark24Cartridge } from "./fca-tigershark-2.4.ts";
import { gmVortec60StubCartridge } from "./gm-vortec-6.0-stub.ts";
import { leanFuelCartridge } from "./lean-fuel.ts";
import { misfireCartridge } from "./misfire.ts";
import { o2SensorCartridge } from "./o2-sensor.ts";
import { richFuelCartridge } from "./rich-fuel.ts";
import { secondaryAirCartridge } from "./secondary-air.ts";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/** Every cartridge known to the app, keyed by name (packages/ontology/vehicle-profiles.json references these names). */
export const cartridgeRegistry: Record<string, Cartridge> = {
  [misfireCartridge.name]: misfireCartridge,
  [leanFuelCartridge.name]: leanFuelCartridge,
  [richFuelCartridge.name]: richFuelCartridge,
  [evapCartridge.name]: evapCartridge,
  [catalystCartridge.name]: catalystCartridge,
  [o2SensorCartridge.name]: o2SensorCartridge,
  [egrCartridge.name]: egrCartridge,
  [secondaryAirCartridge.name]: secondaryAirCartridge,
  [camCrankCorrelationCartridge.name]: camCrankCorrelationCartridge,
  [fcaTigershark24Cartridge.name]: fcaTigershark24Cartridge,
  [gmVortec60StubCartridge.name]: gmVortec60StubCartridge,
};

export const allCartridges: Cartridge[] = Object.values(cartridgeRegistry);

/**
 * Resolve the cartridges (and therefore the classes) that apply to a vehicle,
 * purely from its engine family — the direct analogue of garden's `views.*`
 * TBox slices, applied per-vehicle instead of per-call-type. A Silverado
 * never loads Tigershark-only classes, and vice versa.
 */
export function resolveCartridgesForEngineFamily(engineFamilyId: string): Cartridge[] {
  const names = getEngineFamilyCartridges(engineFamilyId);
  return names.map((name) => {
    const cartridge = cartridgeRegistry[name];
    if (!cartridge)
      throw new Error(
        `Unknown cartridge "${name}" referenced by engine family "${engineFamilyId}"`,
      );
    return cartridge;
  });
}

/** All DL classes any resolved cartridge's framing rules can trigger — used by classify/lint. */
export function classesForCartridges(cartridges: Cartridge[]): string[] {
  const out = new Set<string>();
  for (const c of cartridges) for (const cls of c.requires.classes) out.add(cls);
  return [...out];
}

/**
 * Turn a proven fault class into a diagnostic Problem draft, by asking every
 * resolved cartridge's framing rules for the highest-priority match. Returns
 * `null` when no loaded cartridge frames that class (e.g. it's a raw
 * Symptom/Condition, not a fault syndrome — those never get framed).
 */
export function draftForClass(
  vehicle: VehicleView,
  className: string,
  cartridges: Cartridge[],
): FramingResult | null {
  let best: { priority: number; build: (v: VehicleView) => FramingResult } | undefined;
  for (const cartridge of cartridges) {
    for (const rule of cartridge.framing) {
      if (rule.whenClass === className && (!best || rule.priority > best.priority)) best = rule;
    }
  }
  return best ? best.build(vehicle) : null;
}
