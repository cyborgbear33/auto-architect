import {
  CreateDiagnosticProblemSchema,
  CreateVehicleSchema,
  LogRepairSchema,
  ObservationBatchSchema,
} from "@auto/validation";
import type { FastifyInstance } from "fastify";
import { notFound } from "../lib/errors.ts";
import type { Services } from "../services/index.ts";

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

  // --- observations (obd-gateway ingest) --------------------------------------
  app.post("/api/vehicles/:id/observations", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = { ...(req.body as Record<string, unknown>), vehicleId: id };
    const input = ObservationBatchSchema.parse(body);
    await s.observations.record(input);
    reply.code(202);
    return { accepted: true };
  });

  app.get("/api/vehicles/:id/dtcs", async (req) => {
    const { id } = req.params as { id: string };
    return { dtcs: await s.observations.latestDtcs(id) };
  });

  app.get("/api/vehicles/:id/evidence-provenance", async (req) => {
    const { id } = req.params as { id: string };
    return s.observations.provenance(id);
  });

  app.get("/api/vehicles/:id/freeze-frame", async (req) => {
    const { id } = req.params as { id: string };
    return { freezeFrames: await s.observations.latestFreezeFrames(id) };
  });

  app.get("/api/vehicles/:id/mode06", async (req) => {
    const { id } = req.params as { id: string };
    return { results: await s.observations.latestMode06(id) };
  });

  app.get("/api/vehicles/:id/forecast", async (req) => {
    const { id } = req.params as { id: string };
    return s.forecast.oilLevelTrend(id);
  });

  app.get("/api/vehicles/:id/solution-history", async (req) => {
    const { id } = req.params as { id: string };
    const { class: faultClass } = req.query as { class?: string };
    return s.solutionHistory.forVehicle(id, faultClass);
  });

  // --- recognition (LOGOS realize) --------------------------------------------
  app.get("/api/vehicles/:id/recognition", async (req) => {
    const { id } = req.params as { id: string };
    return s.recognition.recognize(id);
  });

  // --- recommendations ---------------------------------------------------------
  app.get("/api/vehicles/:id/recommendations", async (req) => {
    const { id } = req.params as { id: string };
    return { recommendations: await s.recommendations.list(id) };
  });

  app.post("/api/vehicles/:id/recommendations/refresh", async (req) => {
    const { id } = req.params as { id: string };
    return { recommendations: await s.recommendations.refresh(id) };
  });

  app.post("/api/recommendations/:id/status", async (req) => {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };
    return s.recommendations.markStatus(id, status as never);
  });

  // --- recall / TSB matcher ----------------------------------------------------
  app.get("/api/vehicles/:id/campaigns", async (req) => {
    const { id } = req.params as { id: string };
    return s.campaigns.forVehicle(id);
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
}
