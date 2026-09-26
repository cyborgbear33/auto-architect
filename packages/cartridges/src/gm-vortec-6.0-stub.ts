import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/**
 * GM Vortec 6.0L (LQ4-class) cartridge for the 2003 Silverado 2500 HD (A5).
 *
 * `KnockSensorCircuitFault` and `LeanFuelBank1`/`LeanFuelBank2` are already
 * SAE-generic classes in the `generic` view (see `knock-sensor.ts` /
 * `lean-fuel.ts`) — this cartridge does not need a new GM-specific class or
 * view. It re-frames those same classes with a higher-priority build that
 * leads with the two curated GM TSBs instead of the generic playbook, the
 * same way a higher-priority framing rule always wins in `draftForClass`
 * (packages/cartridges/src/registry.ts) — see docs/ai/ADD_A_VEHICLE.md.
 *
 * Both TSBs are `sourceType: "corroborated"` in known-campaigns.json (not
 * primary-source PDF-verified — see docs/ai/OEM_RESEARCH_SOURCES.md). The
 * playbooks follow those transcriptions, including the limits they state:
 * 023A is 1999–2002 and P0332 only; 029A titles L59 rough idle / P0300 and
 * says it may apply to this LQ4.
 */

/** Bulletin 02-06-04-023A names P0332 on 1999–2002 trucks. This profile is a 2003. */
function knockPlaybook(hasP0332: boolean): CandidateAction[] {
  if (!hasP0332) {
    return [
      {
        id: "trace-knock-circuit-outside-bulletin",
        description:
          "trace the active knock-sensor circuit as its own fault — TSB 02-06-04-023A names DTC P0332 only, and its model years stop at 2002",
        impact: 0.5,
        confidence: 0.55,
        infoGain: 0.6,
        cost: 0.2,
        risk: 0.05,
        reversibility: 1,
        tags: ["diagnostic", "measure"],
        firstStep: "do not apply the rear-sensor RTV bulletin unless P0332 is the code",
      },
    ];
  }
  return [
    {
      id: "confirm-rear-knock-bulletin-fit",
      description:
        "confirm DTC P0332 and whether the engine compartment is washed often — TSB 02-06-04-023A lists 1999–2002 Silverado (LQ4 VIN U included), not 2003; the stated condition is spark knock and/or an MIL with P0332, more apparent after engine-compartment washing",
      impact: 0.4,
      confidence: 0.7,
      infoGain: 0.7,
      cost: 0.05,
      risk: 0,
      reversibility: 1,
      tags: ["diagnostic", "measure", "tsb-02-06-04-023a"],
      firstStep: "year fit first — this truck is one model year past the bulletin list",
    },
    {
      id: "remove-intake-for-rear-knock-sensor",
      description:
        "remove the intake manifold to reach the rear-bank knock sensor — that is step 1 of the transcribed 02-06-04-023A procedure",
      impact: 0.5,
      confidence: 0.6,
      infoGain: 0.4,
      cost: 0.4,
      risk: 0.1,
      reversibility: 0.8,
      tags: ["repair", "tsb-02-06-04-023a"],
    },
    {
      id: "replace-rear-knock-sensor",
      description:
        "replace the rear-bank knock sensor with P/N 10456603 and tighten to 20 N·m (15 lb ft) — the bulletin parts list has that one sensor, not the front sensor and not intake gaskets",
      impact: 0.6,
      confidence: 0.6,
      infoGain: 0.4,
      cost: 0.3,
      risk: 0.1,
      reversibility: 0.7,
      tags: ["repair", "tsb-02-06-04-023a"],
    },
    {
      id: "rtv-dam-rear-knock-open",
      description:
        "lay an RTV bead about 9 mm wide and 6 mm high along the valley-cover ridge around the rear sensor — do not form a complete circle; leave the rear section open, as the bulletin states",
      impact: 0.45,
      confidence: 0.65,
      infoGain: 0.2,
      cost: 0.1,
      risk: 0.05,
      reversibility: 0.9,
      tags: ["repair", "tsb-02-06-04-023a"],
    },
    {
      id: "remove-rear-intake-foam-seal",
      description:
        "from the underside of the intake, remove the rear intake-manifold foam seal completely before reinstalling the manifold",
      impact: 0.3,
      confidence: 0.6,
      infoGain: 0.1,
      cost: 0.05,
      risk: 0.05,
      reversibility: 0.9,
      tags: ["repair", "tsb-02-06-04-023a"],
    },
  ];
}

function knockDraft(vehicle: VehicleView): FramingResult {
  const activeCodes = new Set(vehicle.dtcs.map((d) => d.code));
  const hasP0332 = activeCodes.has("P0332");
  const frontOnly = activeCodes.has("P0327") && !hasP0332;
  const bank = hasP0332 ? "rear-bank" : frontOnly ? "front-bank" : "knock-sensor";
  return {
    label: hasP0332
      ? `${vehicle.label}: rear knock sensor P0332 (023A lists 1999–2002, not this 2003)`
      : `${vehicle.label}: knock sensor circuit (023A does not cover this code)`,
    statement: {
      currentState: `a ${bank} knock sensor circuit DTC is active`,
      desiredState: hasP0332
        ? "P0332 gone after the rear sensor and open RTV dam, or the 1999–2002 bulletin set aside because this is a 2003"
        : "the active knock-sensor circuit traced without using the rear-sensor bulletin",
      gap: hasP0332
        ? "TSB 02-06-04-023A describes rear-bank P0332 from water in the sensor cavity on 1999–2002 Silverados (LQ4 VIN U is in that list). This profile is a 2003, so the procedure is the same engine layout, not a listed model year"
        : "TSB 02-06-04-023A names DTC P0332 only. Another knock-sensor code is not that bulletin",
      whyItMatters: hasP0332
        ? "the bulletin's condition is audible spark knock and/or an MIL with P0332, which it says may be rear-sensor corrosion from water — especially if the engine compartment is washed often. It does not say the code rules detonation out"
        : "applying the rear-sensor RTV repair here would follow a bulletin that does not name this code",
      urgency: "medium",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: hasP0332
        ? "P0332 does not return after a drive cycle, with the RTV bead left open at the rear if that repair was done"
        : "the active knock code explained as a circuit fault, not as bulletin 02-06-04-023A",
      measurement: "rescan after the repair and a drive cycle that previously set the code",
    },
    actions: knockPlaybook(hasP0332),
    causalModel: {
      symptoms: [...activeCodes].filter((c) => ["P0325", "P0327", "P0330", "P0332"].includes(c)),
      possibleCauses: hasP0332
        ? [
            "rear knock-sensor corrosion from water in the cavity (TSB 02-06-04-023A, model years 1999–2002)",
            "a failed rear knock sensor",
            "wiring between the rear sensor and the PCM",
            "spark knock the sensor is actually reporting — the bulletin lists ping as a customer comment, not as something the code excludes",
          ]
        : [
            "knock-sensor circuit fault other than P0332 — not covered by TSB 02-06-04-023A",
            "wiring between that sensor and the PCM",
          ],
      mostLikelyCauses: hasP0332
        ? [
            "water intrusion at the rear knock sensor — the bulletin's stated cause for P0332, on trucks it lists through 2002",
          ]
        : ["a knock-sensor circuit fault outside bulletin 02-06-04-023A"],
    },
  };
}

function leanGasketPlaybook(bank: 1 | 2, bothBanksLean: boolean): CandidateAction[] {
  const bothNote = bothBanksLean
    ? " — both banks lean together can be one shared leak; that pattern is not a code the bulletin names"
    : "";
  // Smoke and MAF are generic lean checks. Bulletin 05-06-04-029A's named
  // repair is the teal gasket, and only after rough idle, misfire, or P0300
  // already points at an intake-gasket air leak.
  return [
    {
      id: `smoke-test-intake-bank${bank}-gm`,
      description: `smoke-test the intake tract on bank ${bank} for an unmetered air leak before assuming the intake gasket${bothNote}`,
      impact: 0.5,
      confidence: 0.7,
      infoGain: 0.7,
      cost: 0.3,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep: "a generic leak check — not a step the bulletin lists",
    },
    {
      id: "check-maf-contamination-gm",
      description:
        "clean/inspect the mass airflow sensor for contamination before condemning the gasket",
      impact: 0.25,
      confidence: 0.5,
      infoGain: 0.4,
      cost: 0.1,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
    {
      id: "replace-intake-gasket-teal",
      description:
        "if rough idle, misfire, or P0300 already points to an intake-gasket air leak, replace the upper intake gaskets with teal-green P/N 89017589 — TSB 05-06-04-029A says not to install orange P/N 17113557. The titled engines are 2002–2004 L59 flex-fuel; the text says it may also apply to regular-fuel LQ4 (VIN U). The retrieved text does not name P0171/P0174 or a coolant leak",
      impact: 0.65,
      confidence: 0.6,
      infoGain: 0.4,
      cost: 0.45,
      risk: 0.1,
      reversibility: 0.6,
      tags: ["repair", "tsb-05-06-04-029a"],
      stopConditions: "only if rough idle, misfire, or P0300 already points at an intake-gasket air leak",
    },
    {
      id: "inspect-intake-deck-warpage",
      description:
        "inspect the intake-manifold-to-cylinder-head deck for warpage, which the bulletin names after the gasket replacement — the retrieved text does not give a measurement limit",
      impact: 0.3,
      confidence: 0.4,
      infoGain: 0.2,
      cost: 0.2,
      risk: 0.05,
      reversibility: 0.7,
      tags: ["repair", "tsb-05-06-04-029a"],
    },
  ];
}

function leanGasketDraft(bank: 1 | 2): (vehicle: VehicleView) => FramingResult {
  return (vehicle) => {
    const activeCodes = new Set(vehicle.dtcs.map((d) => d.code));
    const bothBanksLean = activeCodes.has("P0171") && activeCodes.has("P0174");
    return {
      label: `${vehicle.label}: lean condition bank ${bank} (GM Vortec — 029A names P0300, not this lean code)`,
      statement: {
        currentState: bothBanksLean
          ? "both banks are running lean with sustained positive long-term fuel trim"
          : `bank ${bank} is running lean with sustained positive long-term fuel trim`,
        desiredState: `bank ${bank} fuel trim back within normal range and the lean DTC cleared`,
        gap: bothBanksLean
          ? "both banks are lean, which can be one shared unmetered-air leak. TSB 05-06-04-029A names rough idle, misfire, and P0300 — not lean codes — and says to use it only after the diagnostic check points at the intake gasket. Titled engines are L59; it says it may apply to this LQ4"
          : "one bank is lean. TSB 05-06-04-029A still only applies if rough idle, misfire, or P0300 already points at the upper intake gasket; a single-bank lean is not what that bulletin titles",
        whyItMatters:
          "the bulletin's stated failure is an unmetered air leak after the upper intake gasket degrades. That can lean the engine out. The retrieved text does not add a coolant-leak finding",
        urgency: "medium",
      },
      gapType: "causal",
      desiredState: {
        successCriteria: `bank ${bank} long-term fuel trim returns to normal range and the lean DTC does not return after a drive cycle`,
        measurement:
          "monitor long-term fuel trim on the affected bank and rescan for the lean DTC after the repair",
      },
      actions: leanGasketPlaybook(bank, bothBanksLean),
      causalModel: {
        symptoms: [
          `bank ${bank} lean DTC`,
          "sustained positive long-term fuel trim on the affected bank",
          ...(bothBanksLean ? ["both banks lean together"] : []),
        ],
        possibleCauses: [
          "upper intake gasket degradation into an unmetered air leak (TSB 05-06-04-029A) when rough idle, misfire, or P0300 already points there",
          "vacuum / unmetered air leak elsewhere on the intake path for this bank",
          "MAF or MAP measurement error skewing fueling",
          "weak or clogged fuel injector / low fuel pressure on this bank",
        ],
        mostLikelyCauses: bothBanksLean
          ? [
              "a shared unmetered-air leak — both banks lean together is consistent with one intake gasket, but P0300 is the bulletin's named code, not P0171/P0174",
            ]
          : [
              "unmetered air or a fuel-delivery shortfall on this bank — prove which, and do not treat a one-bank lean code as bulletin 05-06-04-029A by itself",
            ],
      },
    };
  };
}

export const gmVortec60StubCartridge: Cartridge = {
  name: "gm-vortec-6.0-stub",
  perception: [],
  framing: [
    { whenClass: "KnockSensorCircuitFault", priority: 90, build: knockDraft },
    { whenClass: "LeanFuelBank1", priority: 90, build: leanGasketDraft(1) },
    { whenClass: "LeanFuelBank2", priority: 90, build: leanGasketDraft(2) },
  ],
  requires: {
    classes: ["KnockSensorCircuitFault", "LeanFuelBank1", "LeanFuelBank2"],
  },
};
