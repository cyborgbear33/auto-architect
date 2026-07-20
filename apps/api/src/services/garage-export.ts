/**
 * Portable garage JSON dump + CSV tables. Compose-only for export; import
 * merges into the store without inventing fault classes (no realize/solve).
 */
import type {
  DecisionRecord,
  DiagnosticProblem,
  GarageDump,
  GarageImportResult,
  ObservationBatch,
  Recommendation,
  VehicleProfile,
} from "@auto/semantic-types";
import {
  GARAGE_DUMP_FORMAT,
  GARAGE_DUMP_VERSION,
} from "@auto/semantic-types";
import { toCsv } from "../lib/csv.ts";
import type { Store } from "../store/index.ts";
import type { CaseTimelineService } from "./case-timeline.ts";
import type { VehicleService } from "./vehicle.ts";

function batchKey(b: ObservationBatch): string {
  return `${b.vehicleId}\0${b.capturedAt}\0${b.source}`;
}

export class GarageExportService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
    private caseTimeline: CaseTimelineService,
  ) {}

  async dumpGarage(): Promise<GarageDump> {
    const vehicles = await this.store.vehicles.list();
    return this.assemble("garage", null, vehicles);
  }

  async dumpVehicle(vehicleId: string): Promise<GarageDump> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    return this.assemble("vehicle", vehicleId, [vehicle]);
  }

  async observationsCsv(vehicleId: string): Promise<string> {
    await this.vehicles.getOrThrow(vehicleId);
    const batches = await this.store.observations.listBatches(vehicleId);
    type Row = {
      vehicleId: string;
      capturedAt: string;
      source: string;
      pid: string;
      value: string;
      unit: string;
      timestamp: string;
      odometerMiles: string;
    };
    const rows: Row[] = [];
    for (const b of batches) {
      for (const p of b.pids ?? []) {
        rows.push({
          vehicleId: b.vehicleId,
          capturedAt: b.capturedAt,
          source: b.source,
          pid: p.pid,
          value: String(p.value),
          unit: p.unit ?? "",
          timestamp: p.timestamp,
          odometerMiles: b.odometerMiles != null ? String(b.odometerMiles) : "",
        });
      }
    }
    return toCsv(rows, [
      { key: "vehicleId", header: "vehicleId" },
      { key: "capturedAt", header: "capturedAt" },
      { key: "source", header: "source" },
      { key: "pid", header: "pid" },
      { key: "value", header: "value" },
      { key: "unit", header: "unit" },
      { key: "timestamp", header: "timestamp" },
      { key: "odometerMiles", header: "odometerMiles" },
    ]);
  }

  async dtcsCsv(vehicleId: string): Promise<string> {
    await this.vehicles.getOrThrow(vehicleId);
    const batches = await this.store.observations.listBatches(vehicleId);
    type Row = {
      vehicleId: string;
      capturedAt: string;
      source: string;
      code: string;
      status: string;
      ecu: string;
      description: string;
    };
    const rows: Row[] = [];
    for (const b of batches) {
      for (const d of b.dtcs ?? []) {
        rows.push({
          vehicleId: b.vehicleId,
          capturedAt: b.capturedAt,
          source: b.source,
          code: d.code,
          status: d.status,
          ecu: d.ecu ?? "",
          description: d.description ?? "",
        });
      }
    }
    return toCsv(rows, [
      { key: "vehicleId", header: "vehicleId" },
      { key: "capturedAt", header: "capturedAt" },
      { key: "source", header: "source" },
      { key: "code", header: "code" },
      { key: "status", header: "status" },
      { key: "ecu", header: "ecu" },
      { key: "description", header: "description" },
    ]);
  }

  async decisionsCsv(vehicleId: string): Promise<string> {
    await this.vehicles.getOrThrow(vehicleId);
    const decisions = await this.store.decisions.listByVehicle(vehicleId);
    return toCsv(decisions, [
      { key: "id", header: "id" },
      { key: "vehicleId", header: "vehicleId" },
      { key: "problemId", header: "problemId" },
      { key: "actionId", header: "actionId" },
      { key: "rationale", header: "rationale" },
      { key: "decidedAt", header: "decidedAt" },
      { key: "decidedBy", header: "decidedBy" },
      { key: (d) => String(d.policyAllowed), header: "policyAllowed" },
      { key: (d) => d.outcome?.status ?? "", header: "outcomeStatus" },
      { key: (d) => d.outcome?.recordedAt ?? "", header: "outcomeRecordedAt" },
    ]);
  }

  async problemsCsv(vehicleId: string): Promise<string> {
    await this.vehicles.getOrThrow(vehicleId);
    const problems = await this.store.problems.listByVehicle(vehicleId);
    return toCsv(problems, [
      { key: "id", header: "id" },
      { key: "vehicleId", header: "vehicleId" },
      { key: "status", header: "status" },
      { key: (p) => p.triggeredByClass ?? "", header: "triggeredByClass" },
      { key: "createdAt", header: "createdAt" },
      { key: "updatedAt", header: "updatedAt" },
      { key: (p) => p.outcome?.status ?? "", header: "outcomeStatus" },
      { key: (p) => p.verification?.result ?? "", header: "verifyResult" },
      { key: (p) => p.statement.currentState, header: "currentState" },
      { key: (p) => p.statement.desiredState, header: "desiredState" },
      { key: (p) => p.reopenedFromId ?? "", header: "reopenedFromId" },
    ]);
  }

  async timelineCsv(vehicleId: string): Promise<string> {
    const timeline = await this.caseTimeline.forVehicle(vehicleId);
    return toCsv(timeline.events, [
      { key: "at", header: "at" },
      { key: "type", header: "type" },
      { key: "problemId", header: "problemId" },
      { key: (e) => e.faultClass ?? "", header: "faultClass" },
      { key: "summary", header: "summary" },
      { key: (e) => e.actionId ?? "", header: "actionId" },
      { key: (e) => e.outcomeStatus ?? "", header: "outcomeStatus" },
      { key: (e) => e.verifyResult ?? "", header: "verifyResult" },
      { key: (e) => e.decisionId ?? "", header: "decisionId" },
    ]);
  }

  /**
   * Merge a validated dump into the store. Observations are append-only with
   * dedupe on (vehicleId, capturedAt, source). Entities upsert by id.
   */
  async importDump(dump: GarageDump): Promise<GarageImportResult> {
    const result: GarageImportResult = {
      vehiclesUpserted: 0,
      observationsAppended: 0,
      observationsSkipped: 0,
      problemsUpserted: 0,
      decisionsUpserted: 0,
      recommendationsUpserted: 0,
    };

    for (const v of dump.vehicles) {
      const profile = v as unknown as VehicleProfile;
      const existing = await this.store.vehicles.get(profile.id);
      if (existing) {
        await this.store.vehicles.update(profile.id, profile);
      } else {
        await this.store.vehicles.create(profile);
      }
      result.vehiclesUpserted += 1;
    }

    const seenKeys = new Set<string>();
    for (const vehicle of dump.vehicles) {
      for (const b of await this.store.observations.listBatches(vehicle.id)) {
        seenKeys.add(batchKey(b));
      }
    }

    for (const batch of dump.observations) {
      const key = batchKey(batch);
      if (seenKeys.has(key)) {
        result.observationsSkipped += 1;
        continue;
      }
      await this.store.observations.record(batch);
      seenKeys.add(key);
      result.observationsAppended += 1;
      if (batch.odometerMiles !== undefined) {
        await this.store.vehicles.update(batch.vehicleId, {
          odometerMiles: batch.odometerMiles,
        });
      }
    }

    for (const raw of dump.problems) {
      const problem = raw as unknown as DiagnosticProblem;
      const existing = await this.store.problems.get(problem.id);
      if (existing) {
        await this.store.problems.update(problem.id, problem);
      } else {
        await this.store.problems.create(problem);
      }
      result.problemsUpserted += 1;
    }

    for (const raw of dump.decisions) {
      const decision = raw as unknown as DecisionRecord;
      const existing = (await this.store.decisions.listByVehicle(decision.vehicleId)).find(
        (d) => d.id === decision.id,
      );
      if (existing) {
        result.decisionsUpserted += 1;
        continue;
      }
      await this.store.decisions.create(decision);
      result.decisionsUpserted += 1;
    }

    for (const raw of dump.recommendations ?? []) {
      const rec = raw as unknown as Recommendation;
      const list = await this.store.recommendations.listByVehicle(rec.vehicleId);
      const existing = list.find((r) => r.id === rec.id);
      if (existing) {
        await this.store.recommendations.update(rec.id, rec);
      } else {
        await this.store.recommendations.create(rec);
      }
      result.recommendationsUpserted += 1;
    }

    return result;
  }

  private async assemble(
    scope: "garage" | "vehicle",
    vehicleId: string | null,
    vehicles: VehicleProfile[],
  ): Promise<GarageDump> {
    const observations: ObservationBatch[] = [];
    const problems: DiagnosticProblem[] = [];
    const decisions: DecisionRecord[] = [];
    const recommendations: Recommendation[] = [];

    for (const v of vehicles) {
      observations.push(...(await this.store.observations.listBatches(v.id)));
      problems.push(...(await this.store.problems.listByVehicle(v.id)));
      decisions.push(...(await this.store.decisions.listByVehicle(v.id)));
      recommendations.push(...(await this.store.recommendations.listByVehicle(v.id)));
    }

    return {
      format: GARAGE_DUMP_FORMAT,
      version: GARAGE_DUMP_VERSION,
      exportedAt: new Date().toISOString(),
      scope,
      vehicleId,
      vehicles,
      observations,
      problems,
      decisions,
      recommendations,
    };
  }
}
