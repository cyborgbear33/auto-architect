import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/**
 * SAE-generic O2 sensor cartridge (upstream sensor 1 + downstream sensor 2):
 * - circuit / performance / heater DTCs
 * - Mode 06 OBDMIDs $01/$05 (up), $02/$06 (down), heaters $41/$45/$42/$46
 * O2 voltage PIDs are evidence adjacency only — no invented switching thresholds.
 */

type SensorPos = "upstream" | "downstream";

function sensorLabel(pos: SensorPos): string {
  return pos === "upstream" ? "sensor 1 (upstream)" : "sensor 2 (downstream)";
}

function circuitPlaybook(bank: 1 | 2, pos: SensorPos): CandidateAction[] {
  const where = sensorLabel(pos);
  return [
    {
      id: `check-o2-wiring-bank${bank}-${pos}`,
      description: `inspect O2 ${where} wiring and connector on bank ${bank} for open/short/chafing`,
      impact: 0.55,
      confidence: 0.7,
      infoGain: 0.8,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
    },
    {
      id: `verify-o2-signal-bank${bank}-${pos}`,
      description: `verify the bank ${bank} ${where} O2 signal with a scope or live data before replacing the sensor`,
      impact: 0.5,
      confidence: 0.65,
      infoGain: 0.75,
      cost: 0.2,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
  ];
}

function performancePlaybook(bank: 1 | 2, pos: SensorPos): CandidateAction[] {
  const where = sensorLabel(pos);
  const first =
    pos === "upstream"
      ? "rule out exhaust leaks upstream of the sensor — they commonly fake slow-response codes"
      : "compare upstream vs downstream activity — a lazy downstream sensor often tracks catalyst efficiency checks";
  return [
    {
      id: `scope-o2-switch-bank${bank}-${pos}`,
      description: `scope or graph bank ${bank} ${where} O2 voltage while warm before condemning the sensor`,
      impact: 0.55,
      confidence: 0.75,
      infoGain: 0.9,
      cost: 0.2,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep: first,
    },
    {
      id: `check-exhaust-leak-o2-bank${bank}-${pos}`,
      description: `inspect for exhaust leaks near bank ${bank} ${where}`,
      impact: 0.45,
      confidence: 0.65,
      infoGain: 0.7,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
    },
  ];
}

function heaterPlaybook(bank: 1 | 2, pos: SensorPos): CandidateAction[] {
  const where = sensorLabel(pos);
  return [
    {
      id: `check-o2-heater-power-bank${bank}-${pos}`,
      description: `check heater power/ground and fuse for bank ${bank} ${where}`,
      impact: 0.55,
      confidence: 0.75,
      infoGain: 0.85,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep: "confirm heater supply voltage before condemning the sensor",
    },
    {
      id: `measure-o2-heater-resistance-bank${bank}-${pos}`,
      description: `measure heater element resistance on bank ${bank} ${where}`,
      impact: 0.45,
      confidence: 0.7,
      infoGain: 0.7,
      cost: 0.1,
      risk: 0.05,
      reversibility: 1,
    },
  ];
}

function circuitDraft(bank: 1 | 2, pos: SensorPos): (vehicle: VehicleView) => FramingResult {
  const where = sensorLabel(pos);
  return (vehicle) => ({
    label: `${vehicle.label}: O2 circuit bank ${bank} ${where}`,
    statement: {
      currentState: `an O2 sensor circuit DTC is active for bank ${bank} ${where}`,
      desiredState: "no O2 circuit DTC after wiring/sensor repair and a completed O2 monitor",
      gap: "whether the fault is wiring vs the sensor itself is not yet isolated",
      whyItMatters:
        pos === "upstream"
          ? "open/short O2 circuits force open-loop fueling and can set follow-on fuel trim codes"
          : "downstream circuit faults disrupt catalyst monitoring and can set false efficiency codes",
      urgency: "medium",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no O2 circuit DTC across a drive cycle with a completed O2 monitor",
      measurement: "rescan after repair; confirm live O2 activity returns",
    },
    actions: circuitPlaybook(bank, pos),
  });
}

function performanceDraft(bank: 1 | 2, pos: SensorPos): (vehicle: VehicleView) => FramingResult {
  const where = sensorLabel(pos);
  return (vehicle) => ({
    label: `${vehicle.label}: O2 performance bank ${bank} ${where}`,
    statement: {
      currentState: `an O2 sensor performance fault or failed Mode 06 O2 monitor is present on bank ${bank} ${where}`,
      desiredState: "no O2 performance DTC and a completed O2 monitor after repair",
      gap: "whether the sensor is aged/contaminated vs an exhaust leak or related system issue is not yet isolated",
      whyItMatters:
        pos === "upstream"
          ? "a slow or biased upstream O2 corrupts closed-loop fuel control and can cascade into catalyst / trim codes"
          : "a lazy downstream O2 often accompanies or fakes catalyst efficiency failures",
      urgency: "medium",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no O2 performance DTC after a warm drive cycle with a completed O2 monitor",
      measurement: `rescan; confirm ${where} O2 activity is appropriate when warm`,
    },
    actions: performancePlaybook(bank, pos),
  });
}

function heaterDraft(bank: 1 | 2, pos: SensorPos): (vehicle: VehicleView) => FramingResult {
  const where = sensorLabel(pos);
  return (vehicle) => ({
    label: `${vehicle.label}: O2 heater bank ${bank} ${where}`,
    statement: {
      currentState: `an O2 sensor heater circuit DTC is active for bank ${bank} ${where}`,
      desiredState: "no O2 heater DTC after heater circuit/sensor repair",
      gap: "whether the heater element, fuse, or harness is at fault is not yet isolated",
      whyItMatters:
        "a failed heater delays closed-loop / monitor readiness and can cause cold-start emissions issues",
      urgency: "medium",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no O2 heater DTC after a cold start and completed O2 heater monitor",
      measurement: "rescan after repair; confirm heater current/resistance in-spec",
    },
    actions: heaterPlaybook(bank, pos),
  });
}

export const o2SensorCartridge: Cartridge = {
  name: "o2-sensor",
  perception: [
    {
      dtcConcept: "O2CircuitBank1",
      concept: "O2CircuitBank1",
      as: "symptom",
      slot: "o2-ckt-b1",
    },
    {
      dtcConcept: "O2CircuitBank2",
      concept: "O2CircuitBank2",
      as: "symptom",
      slot: "o2-ckt-b2",
    },
    {
      dtcConcept: "O2PerformanceBank1",
      concept: "O2PerformanceBank1",
      as: "symptom",
      slot: "o2-perf-b1",
    },
    {
      dtcConcept: "O2PerformanceBank2",
      concept: "O2PerformanceBank2",
      as: "symptom",
      slot: "o2-perf-b2",
    },
    {
      dtcConcept: "O2HeaterBank1",
      concept: "O2HeaterBank1",
      as: "symptom",
      slot: "o2-htr-b1",
    },
    {
      dtcConcept: "O2HeaterBank2",
      concept: "O2HeaterBank2",
      as: "symptom",
      slot: "o2-htr-b2",
    },
    {
      mode06Concept: "FailedO2MonitorBank1",
      concept: "FailedO2MonitorBank1",
      as: "condition",
      slot: "mode06-o2-b1",
    },
    {
      mode06Concept: "FailedO2MonitorBank2",
      concept: "FailedO2MonitorBank2",
      as: "condition",
      slot: "mode06-o2-b2",
    },
    {
      mode06Concept: "FailedO2HeaterMonitorBank1",
      concept: "FailedO2HeaterMonitorBank1",
      as: "condition",
      slot: "mode06-o2-htr-b1",
    },
    {
      mode06Concept: "FailedO2HeaterMonitorBank2",
      concept: "FailedO2HeaterMonitorBank2",
      as: "condition",
      slot: "mode06-o2-htr-b2",
    },
    {
      dtcConcept: "O2DownstreamCircuitBank1",
      concept: "O2DownstreamCircuitBank1",
      as: "symptom",
      slot: "o2-dn-ckt-b1",
    },
    {
      dtcConcept: "O2DownstreamCircuitBank2",
      concept: "O2DownstreamCircuitBank2",
      as: "symptom",
      slot: "o2-dn-ckt-b2",
    },
    {
      dtcConcept: "O2DownstreamPerformanceBank1",
      concept: "O2DownstreamPerformanceBank1",
      as: "symptom",
      slot: "o2-dn-perf-b1",
    },
    {
      dtcConcept: "O2DownstreamPerformanceBank2",
      concept: "O2DownstreamPerformanceBank2",
      as: "symptom",
      slot: "o2-dn-perf-b2",
    },
    {
      dtcConcept: "O2DownstreamHeaterBank1",
      concept: "O2DownstreamHeaterBank1",
      as: "symptom",
      slot: "o2-dn-htr-b1",
    },
    {
      dtcConcept: "O2DownstreamHeaterBank2",
      concept: "O2DownstreamHeaterBank2",
      as: "symptom",
      slot: "o2-dn-htr-b2",
    },
    {
      mode06Concept: "FailedO2DownstreamMonitorBank1",
      concept: "FailedO2DownstreamMonitorBank1",
      as: "condition",
      slot: "mode06-o2-dn-b1",
    },
    {
      mode06Concept: "FailedO2DownstreamMonitorBank2",
      concept: "FailedO2DownstreamMonitorBank2",
      as: "condition",
      slot: "mode06-o2-dn-b2",
    },
    {
      mode06Concept: "FailedO2DownstreamHeaterMonitorBank1",
      concept: "FailedO2DownstreamHeaterMonitorBank1",
      as: "condition",
      slot: "mode06-o2-dn-htr-b1",
    },
    {
      mode06Concept: "FailedO2DownstreamHeaterMonitorBank2",
      concept: "FailedO2DownstreamHeaterMonitorBank2",
      as: "condition",
      slot: "mode06-o2-dn-htr-b2",
    },
  ],
  framing: [
    { whenClass: "O2CircuitFaultBank1", priority: 55, build: circuitDraft(1, "upstream") },
    { whenClass: "O2CircuitFaultBank2", priority: 55, build: circuitDraft(2, "upstream") },
    { whenClass: "O2PerformanceFaultBank1", priority: 60, build: performanceDraft(1, "upstream") },
    { whenClass: "O2PerformanceFaultBank2", priority: 60, build: performanceDraft(2, "upstream") },
    { whenClass: "O2HeaterFaultBank1", priority: 50, build: heaterDraft(1, "upstream") },
    { whenClass: "O2HeaterFaultBank2", priority: 50, build: heaterDraft(2, "upstream") },
    {
      whenClass: "O2DownstreamCircuitFaultBank1",
      priority: 52,
      build: circuitDraft(1, "downstream"),
    },
    {
      whenClass: "O2DownstreamCircuitFaultBank2",
      priority: 52,
      build: circuitDraft(2, "downstream"),
    },
    {
      whenClass: "O2DownstreamPerformanceFaultBank1",
      priority: 58,
      build: performanceDraft(1, "downstream"),
    },
    {
      whenClass: "O2DownstreamPerformanceFaultBank2",
      priority: 58,
      build: performanceDraft(2, "downstream"),
    },
    {
      whenClass: "O2DownstreamHeaterFaultBank1",
      priority: 48,
      build: heaterDraft(1, "downstream"),
    },
    {
      whenClass: "O2DownstreamHeaterFaultBank2",
      priority: 48,
      build: heaterDraft(2, "downstream"),
    },
  ],
  requires: {
    classes: [
      "O2CircuitBank1",
      "O2CircuitBank2",
      "O2PerformanceBank1",
      "O2PerformanceBank2",
      "O2HeaterBank1",
      "O2HeaterBank2",
      "O2DownstreamCircuitBank1",
      "O2DownstreamCircuitBank2",
      "O2DownstreamPerformanceBank1",
      "O2DownstreamPerformanceBank2",
      "O2DownstreamHeaterBank1",
      "O2DownstreamHeaterBank2",
      "FailedO2MonitorBank1",
      "FailedO2MonitorBank2",
      "FailedO2HeaterMonitorBank1",
      "FailedO2HeaterMonitorBank2",
      "FailedO2DownstreamMonitorBank1",
      "FailedO2DownstreamMonitorBank2",
      "FailedO2DownstreamHeaterMonitorBank1",
      "FailedO2DownstreamHeaterMonitorBank2",
      "O2CircuitFaultBank1",
      "O2CircuitFaultBank2",
      "O2PerformanceFaultBank1",
      "O2PerformanceFaultBank2",
      "O2HeaterFaultBank1",
      "O2HeaterFaultBank2",
      "O2DownstreamCircuitFaultBank1",
      "O2DownstreamCircuitFaultBank2",
      "O2DownstreamPerformanceFaultBank1",
      "O2DownstreamPerformanceFaultBank2",
      "O2DownstreamHeaterFaultBank1",
      "O2DownstreamHeaterFaultBank2",
    ],
    dtcConcepts: [
      "O2CircuitBank1",
      "O2CircuitBank2",
      "O2PerformanceBank1",
      "O2PerformanceBank2",
      "O2HeaterBank1",
      "O2HeaterBank2",
      "O2DownstreamCircuitBank1",
      "O2DownstreamCircuitBank2",
      "O2DownstreamPerformanceBank1",
      "O2DownstreamPerformanceBank2",
      "O2DownstreamHeaterBank1",
      "O2DownstreamHeaterBank2",
    ],
    mode06Concepts: [
      "FailedO2MonitorBank1",
      "FailedO2MonitorBank2",
      "FailedO2HeaterMonitorBank1",
      "FailedO2HeaterMonitorBank2",
      "FailedO2DownstreamMonitorBank1",
      "FailedO2DownstreamMonitorBank2",
      "FailedO2DownstreamHeaterMonitorBank1",
      "FailedO2DownstreamHeaterMonitorBank2",
    ],
    pids: ["O2_B1S1", "O2_B1S2", "O2_B2S1", "O2_B2S2"],
  },
};
