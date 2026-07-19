import type {
  DecisionRecord,
  DiagnosticProblem,
  DtcObservation,
  FreezeFrame,
  KnownCampaign,
  Mode06Result,
  Recognition,
  Recommendation,
  VehicleProfile,
} from "@auto/semantic-types";

/** In dev, Vite proxies /api and /health to the API (see vite.config.ts), so a relative base works. */
const baseUrl = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    // Fastify's JSON body parser rejects an empty body when content-type is
    // application/json (e.g. a POST action with no payload) — only send the
    // header when there's actually a body to parse.
    headers: init?.body
      ? { "content-type": "application/json", ...(init?.headers ?? {}) }
      : init?.headers,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(
      err?.message ?? `Request to ${path} failed (HTTP ${res.status})`,
      res.status,
      err?.code,
      err?.details,
    );
  }
  return body as T;
}

const enc = (id: string) => encodeURIComponent(id);

export interface TsbEntry {
  id: string;
  title: string;
  engineFamily: string;
  summary: string;
  reference?: string;
}

export interface EngineFamilySummary {
  id: string;
  label: string;
  cartridges: string[];
}

export const api = {
  // --- vehicles ------------------------------------------------------------
  listVehicles: () =>
    request<{ vehicles: VehicleProfile[] }>("/api/vehicles").then((r) => r.vehicles),
  getVehicle: (id: string) => request<VehicleProfile>(`/api/vehicles/${enc(id)}`),
  listEngineFamilies: () =>
    request<{ engineFamilies: EngineFamilySummary[] }>("/api/engine-families").then(
      (r) => r.engineFamilies,
    ),
  createVehicle: (input: {
    make: string;
    model: string;
    year?: number | null;
    trim?: string | null;
    engineFamily: string;
    vin?: string;
  }) => request<VehicleProfile>("/api/vehicles", { method: "POST", body: JSON.stringify(input) }),

  // --- observations / evidence ----------------------------------------------
  getDtcs: (vehicleId: string) =>
    request<{ dtcs: DtcObservation[] }>(`/api/vehicles/${enc(vehicleId)}/dtcs`).then((r) => r.dtcs),
  getFreezeFrames: (vehicleId: string) =>
    request<{ freezeFrames: FreezeFrame[] }>(`/api/vehicles/${enc(vehicleId)}/freeze-frame`).then(
      (r) => r.freezeFrames,
    ),
  getMode06: (vehicleId: string) =>
    request<{ results: Mode06Result[] }>(`/api/vehicles/${enc(vehicleId)}/mode06`).then(
      (r) => r.results,
    ),
  getForecast: (vehicleId: string) =>
    request<{ declining: boolean; series: Array<{ timestamp: string; value: number }> }>(
      `/api/vehicles/${enc(vehicleId)}/forecast`,
    ),

  // --- recognition (LOGOS realize) ------------------------------------------
  getRecognition: (vehicleId: string) =>
    request<Recognition>(`/api/vehicles/${enc(vehicleId)}/recognition`),

  // --- recommendations -------------------------------------------------------
  getRecommendations: (vehicleId: string) =>
    request<{ recommendations: Recommendation[] }>(
      `/api/vehicles/${enc(vehicleId)}/recommendations`,
    ).then((r) => r.recommendations),
  refreshRecommendations: (vehicleId: string) =>
    request<{ recommendations: Recommendation[] }>(
      `/api/vehicles/${enc(vehicleId)}/recommendations/refresh`,
      {
        method: "POST",
      },
    ).then((r) => r.recommendations),
  markRecommendationStatus: (id: string, status: Recommendation["status"]) =>
    request<Recommendation>(`/api/recommendations/${enc(id)}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  // --- recall / TSB matcher ---------------------------------------------------
  getCampaigns: (vehicleId: string) =>
    request<{ campaigns: KnownCampaign[]; tsbs: TsbEntry[] }>(
      `/api/vehicles/${enc(vehicleId)}/campaigns`,
    ),

  // --- diagnostic problems + policy -------------------------------------------
  listProblems: (vehicleId: string) =>
    request<{ problems: DiagnosticProblem[] }>(`/api/vehicles/${enc(vehicleId)}/problems`).then(
      (r) => r.problems,
    ),
  getProblem: (id: string) => request<DiagnosticProblem>(`/api/problems/${enc(id)}`),
  createDiagnosticProblem: (input: { vehicleId: string; triggeredByClass: string }) =>
    request<DiagnosticProblem>("/api/actions/create-diagnostic-problem", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  solveDiagnosticProblem: (problemId: string) =>
    request<DiagnosticProblem>("/api/actions/solve-diagnostic-problem", {
      method: "POST",
      body: JSON.stringify({ problemId }),
    }),
  logRepair: (input: {
    vehicleId: string;
    problemId: string;
    actionId: string;
    rationale: string;
    decidedBy: string;
    outcomeStatus?: "worked" | "partial" | "failed" | "inconclusive";
    note?: string;
  }) =>
    request<DecisionRecord>("/api/actions/log-repair", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  requestClearCodesAndDrive: (vehicleId: string) =>
    request<{ allowed: true; obligations: string[] }>(
      `/api/vehicles/${enc(vehicleId)}/actions/clear-codes-and-drive`,
      {
        method: "POST",
      },
    ),

  // --- decision journal --------------------------------------------------------
  listDecisions: (vehicleId: string) =>
    request<{ decisions: DecisionRecord[] }>(`/api/vehicles/${enc(vehicleId)}/decisions`).then(
      (r) => r.decisions,
    ),
};
