import { listManualConditions } from "@auto/ontology";
import {
  CompleteSpecialProcedureSchema,
  CreateDiagnosticProblemSchema,
  CreateVehicleSchema,
  EndDriveSessionSchema,
  GarageDumpSchema,
  LogRepairSchema,
  MarkKnowledgeGapStatusSchema,
  MarkRecommendationStatusSchema,
  ObdCapabilityReportSchema,
  ObservationBatchSchema,
  ProblemIdActionSchema,
  SetManualConditionsSchema,
  SimulateDriveSessionSchema,
  StartDriveSessionSchema,
  StartSpecialProcedureSchema,
} from "@auto/validation";
import type { FastifyInstance, FastifyReply } from "fastify";
import { notFound } from "../lib/errors.ts";
import type { Services } from "../services/index.ts";

function sendCsv(reply: FastifyReply, filename: string, csv: string) {
  reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .send(csv);
}

/**
 * All API routes. Reads use resource endpoints; state changes use action
 * endpoints (POST /api/actions/*) that go through ActionService — the
 * mutation gate — never a direct store write from a handler.
 */
export async function registerRoutes(app: FastifyInstance, s: Services): Promise<void> {
  app.get("/health", async () => ({
    status: "ok",
    storage: s.store.driver,
    time: new Date().toISOString(),
  }));

  // --- vehicles --------------------------------------------------------------
  app.get("/api/vehicles", async () => ({ vehicles: await s.vehicles.list() }));

  app.get("/api/engine-families", async () => ({
    engineFamilies: s.vehicles.listEngineFamilies(),
  }));

  app.post("/api/vehicles", async (req, reply) => {
    const input = CreateVehicleSchema.parse(req.body);
    reply.code(201);
    return s.vehicles.create(input);
  });

  app.get("/api/vehicles/:id", async (req) => {
    const { id } = req.params as { id: string };
    return s.vehicles.getOrThrow(id);
  });

  app.get("/api/manual-conditions", async () => ({
    conditions: listManualConditions(),
  }));

  app.put("/api/vehicles/:id/manual-conditions", async (req) => {
    const { id } = req.params as { id: string };
    const input = SetManualConditionsSchema.parse(req.body);
    return s.vehicles.setManualConditions(id, input);
  });

  // --- observations (obd-gateway ingest) --------------------------------------
  app.post("/api/vehicles/:id/observations", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = { ...(req.body as Record<string, unknown>), vehicleId: id };
    const input = ObservationBatchSchema.parse(body);
    await s.observations.record(input);
    reply.code(202);
    return { accepted: true };
  });

  app.post("/api/vehicles/:id/observations/import-log", async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      format?: "obdlog-v1" | "json-batches" | "elm327-text" | "auto";
      text?: string;
    };
    return s.observations.importLog(id, { format: body.format, text: body.text ?? "" });
  });

  app.get("/api/vehicles/:id/dtcs", async (req) => {
    const { id } = req.params as { id: string };
    return { dtcs: await s.observations.latestDtcs(id) };
  });

  app.get("/api/vehicles/:id/evidence-provenance", async (req) => {
    const { id } = req.params as { id: string };
    return s.observations.provenance(id);
  });

  app.get("/api/vehicles/:id/live-gauges", async (req) => {
    const { id } = req.params as { id: string };
    return s.observations.liveGauges(id);
  });

  app.get("/api/vehicles/:id/freeze-frame", async (req) => {
    const { id } = req.params as { id: string };
    return { freezeFrames: await s.observations.latestFreezeFrames(id) };
  });

  app.get("/api/vehicles/:id/mode06", async (req) => {
    const { id } = req.params as { id: string };
    return { results: await s.observations.latestMode06(id) };
  });

  // --- OBD capability discovery (support probe → forensics) -------------------
  app.post("/api/vehicles/:id/discovery", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = { ...(req.body as Record<string, unknown>), vehicleId: id };
    const input = ObdCapabilityReportSchema.parse(body);
    const report = await s.discovery.record(input);
    reply.code(202);
    return { accepted: true, capturedAt: report.capturedAt };
  });

  app.get("/api/vehicles/:id/discovery", async (req) => {
    const { id } = req.params as { id: string };
    const forensics = await s.discovery.getForensics(id);
    if (!forensics) throw notFound("DiscoveryReport", id);
    return forensics;
  });

  app.get("/api/vehicles/:id/discovery/report", async (req) => {
    const { id } = req.params as { id: string };
    const report = await s.discovery.getReport(id);
    if (!report) throw notFound("DiscoveryReport", id);
    return report;
  });

  app.get("/api/vehicles/:id/mastery-guide", async (req) => {
    const { id } = req.params as { id: string };
    return s.masteryGuide.forVehicle(id);
  });

  app.get("/api/vehicles/:id/observation-batches", async (req) => {
    const { id } = req.params as { id: string };
    return { batches: await s.observations.listBatches(id) };
  });

  app.post("/api/vehicles/:id/observations/prune", async (req) => {
    const { id } = req.params as { id: string };
    return s.observations.applyRetention(id);
  });

  // --- drive sessions ---------------------------------------------------------
  app.get("/api/vehicles/:id/sessions", async (req) => {
    const { id } = req.params as { id: string };
    return { sessions: await s.driveSessions.list(id) };
  });

  app.post("/api/actions/start-drive-session", async (req, reply) => {
    const input = StartDriveSessionSchema.parse(req.body);
    reply.code(201);
    return s.driveSessions.start(input);
  });

  app.post("/api/actions/end-drive-session", async (req) => {
    const input = EndDriveSessionSchema.parse(req.body);
    return s.driveSessions.end(input);
  });

  app.post("/api/actions/simulate-drive-session", async (req, reply) => {
    const input = SimulateDriveSessionSchema.parse(req.body);
    reply.code(201);
    return s.driveSessions.simulate(input);
  });

  app.get("/api/vehicles/:id/forecast", async (req) => {
    const { id } = req.params as { id: string };
    const { sessionId } = req.query as { sessionId?: string };
    return s.forecast.summary(id, sessionId ? { sessionId } : undefined);
  });

  app.get("/api/vehicles/:id/solution-history", async (req) => {
    const { id } = req.params as { id: string };
    const { class: faultClass } = req.query as { class?: string };
    return s.solutionHistory.forVehicle(id, faultClass);
  });

  app.get("/api/vehicles/:id/case-timeline", async (req) => {
    const { id } = req.params as { id: string };
    const { problemId } = req.query as { problemId?: string };
    return s.caseTimeline.forVehicle(id, problemId);
  });

  app.get("/api/vehicles/:id/learning-cycles", async (req) => {
    const { id } = req.params as { id: string };
    const { problemId } = req.query as { problemId?: string };
    return s.learningCycles.forVehicle(id, problemId);
  });

  app.get("/api/vehicles/:id/knowledge-gaps", async (req) => {
    const { id } = req.params as { id: string };
    const { open } = req.query as { open?: string };
    const proposals = await s.knowledgeGaps.list(id, { openOnly: open === "1" });
    return { proposals };
  });

  app.post("/api/vehicles/:id/knowledge-gaps/refresh", async (req) => {
    const { id } = req.params as { id: string };
    return { proposals: await s.knowledgeGaps.refresh(id) };
  });

  app.get("/api/vehicles/:id/knowledge-gaps/export", async (req) => {
    const { id } = req.params as { id: string };
    return s.knowledgeGaps.exportBundle(id);
  });

  app.post("/api/knowledge-gaps/:id/status", async (req) => {
    const { id } = req.params as { id: string };
    const { status } = MarkKnowledgeGapStatusSchema.parse(req.body);
    return s.actions.markKnowledgeGapStatus(id, status);
  });

  app.get("/api/vehicles/:id/cascade-prognosis", async (req) => {
    const { id } = req.params as { id: string };
    return s.cascadePrognosis.forVehicle(id);
  });

  // --- garage JSON dump + CSV exports / import --------------------------------
  app.get("/api/garage/export", async () => s.garageExport.dumpGarage());

  app.post("/api/garage/import", async (req) => {
    const dump = GarageDumpSchema.parse(req.body);
    return s.garageExport.importDump(dump as unknown as import("@auto/semantic-types").GarageDump);
  });

  app.get("/api/vehicles/:id/export", async (req) => {
    const { id } = req.params as { id: string };
    return s.garageExport.dumpVehicle(id);
  });

  app.get("/api/vehicles/:id/export/observations.csv", async (req, reply) => {
    const { id } = req.params as { id: string };
    const csv = await s.garageExport.observationsCsv(id);
    sendCsv(reply, `observations-${id.replace(/[^a-zA-Z0-9_-]+/g, "_")}.csv`, csv);
  });

  app.get("/api/vehicles/:id/export/dtcs.csv", async (req, reply) => {
    const { id } = req.params as { id: string };
    const csv = await s.garageExport.dtcsCsv(id);
    sendCsv(reply, `dtcs-${id.replace(/[^a-zA-Z0-9_-]+/g, "_")}.csv`, csv);
  });

  app.get("/api/vehicles/:id/export/decisions.csv", async (req, reply) => {
    const { id } = req.params as { id: string };
    const csv = await s.garageExport.decisionsCsv(id);
    sendCsv(reply, `decisions-${id.replace(/[^a-zA-Z0-9_-]+/g, "_")}.csv`, csv);
  });

  app.get("/api/vehicles/:id/export/problems.csv", async (req, reply) => {
    const { id } = req.params as { id: string };
    const csv = await s.garageExport.problemsCsv(id);
    sendCsv(reply, `problems-${id.replace(/[^a-zA-Z0-9_-]+/g, "_")}.csv`, csv);
  });

  app.get("/api/vehicles/:id/export/timeline.csv", async (req, reply) => {
    const { id } = req.params as { id: string };
    const csv = await s.garageExport.timelineCsv(id);
    sendCsv(reply, `timeline-${id.replace(/[^a-zA-Z0-9_-]+/g, "_")}.csv`, csv);
  });

  app.get("/api/vehicles/:id/report", async (req) => {
    const { id } = req.params as { id: string };
    return s.reports.forVehicle(id);
  });

  app.get("/api/problems/:id/report", async (req) => {
    const { id } = req.params as { id: string };
    return s.reports.forProblem(id);
  });

  // --- recognition (LOGOS realize) --------------------------------------------
  app.get("/api/vehicles/:id/recognition", async (req) => {
    const { id } = req.params as { id: string };
    return s.recognition.recognize(id);
  });

  // --- recommendations ---------------------------------------------------------
  app.get("/api/vehicles/:id/recommendations", async (req) => {
    const { id } = req.params as { id: string };
    const { open } = req.query as { open?: string };
    const list =
      open === "1" || open === "true"
        ? await s.recommendations.listOpen(id)
        : await s.recommendations.list(id);
    return { recommendations: list };
  });

  app.post("/api/vehicles/:id/recommendations/refresh", async (req) => {
    const { id } = req.params as { id: string };
    return { recommendations: await s.recommendations.refresh(id) };
  });

  app.post("/api/recommendations/:id/status", async (req) => {
    const { id } = req.params as { id: string };
    const { status } = MarkRecommendationStatusSchema.parse(req.body);
    return s.recommendations.markStatus(id, status);
  });

  app.post("/api/recommendations/:id/convert", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await s.recommendations.convertToRepair(id);
    reply.code(201);
    return result;
  });

  // --- recall / TSB matcher ----------------------------------------------------
  app.get("/api/vehicles/:id/campaigns", async (req) => {
    const { id } = req.params as { id: string };
    return s.campaigns.forVehicle(id);
  });

  // --- special procedures (Proxi, etc.) ----------------------------------------
  app.get("/api/vehicles/:id/special-procedures", async (req) => {
    const { id } = req.params as { id: string };
    return { procedures: await s.specialProcedures.forVehicle(id) };
  });

  app.post("/api/actions/start-special-procedure", async (req, reply) => {
    const input = StartSpecialProcedureSchema.parse(req.body);
    reply.code(201);
    return s.actions.startSpecialProcedure(input);
  });

  app.post("/api/actions/complete-special-procedure", async (req) => {
    const input = CompleteSpecialProcedureSchema.parse(req.body);
    return s.actions.completeSpecialProcedure(input);
  });

  // --- diagnostic problems + policy safety holds ------------------------------
  app.get("/api/vehicles/:id/problems", async (req) => {
    const { id } = req.params as { id: string };
    return { problems: await s.actions.listDiagnosticProblems(id) };
  });

  app.get("/api/problems/:id", async (req) => {
    const { id } = req.params as { id: string };
    return s.actions.getDiagnosticProblem(id);
  });

  app.get("/api/vehicles/:id/decisions", async (req) => {
    const { id } = req.params as { id: string };
    return { decisions: await s.actions.listDecisions(id) };
  });

  app.post("/api/vehicles/:id/actions/clear-codes-and-drive", async (req) => {
    const { id } = req.params as { id: string };
    return s.actions.requestClearCodesAndDrive(id);
  });

  app.post("/api/actions/create-diagnostic-problem", async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    if (body.triggeredByClass) {
      const problem = await s.actions.createDiagnosticProblem({
        vehicleId: String(body.vehicleId),
        triggeredByClass: String(body.triggeredByClass),
        statement: { currentState: "", desiredState: "", gap: "" },
        actions: [],
      });
      reply.code(201);
      return problem;
    }
    const input = CreateDiagnosticProblemSchema.parse(body);
    reply.code(201);
    return s.actions.createDiagnosticProblem(input);
  });

  app.post("/api/actions/solve-diagnostic-problem", async (req) => {
    const { problemId } = req.body as { problemId: string };
    if (!problemId) throw notFound("DiagnosticProblem");
    return s.actions.solveDiagnosticProblem(problemId);
  });

  app.post("/api/actions/log-repair", async (req, reply) => {
    const input = LogRepairSchema.parse(req.body);
    reply.code(201);
    return s.actions.logRepair(input);
  });

  app.post("/api/actions/verify-diagnostic-problem", async (req) => {
    const input = ProblemIdActionSchema.parse(req.body);
    return s.actions.verifyDiagnosticProblem(input);
  });

  app.post("/api/actions/abandon-diagnostic-problem", async (req) => {
    const input = ProblemIdActionSchema.parse(req.body);
    return s.actions.abandonDiagnosticProblem(input);
  });

  app.post("/api/actions/escalate-diagnostic-problem", async (req) => {
    const input = ProblemIdActionSchema.parse(req.body);
    return s.actions.escalateDiagnosticProblem(input);
  });

  app.post("/api/actions/reopen-diagnostic-problem", async (req) => {
    const input = ProblemIdActionSchema.parse(req.body);
    return s.actions.reopenDiagnosticProblem(input);
  });
}
