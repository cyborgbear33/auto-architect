/**
 * @auto/api-client
 *
 * Typed, domain-oriented client. The UI (and future agent/tools) call these
 * functions instead of scattering raw fetch calls. Every path goes through
 * one error shape and one encoding rule so API contract drift is harder.
 *
 * Pattern mirrors @garden/api-client (class + queryKeys factory); auto has no
 * auth/tenant headers yet — add them here when Auth lands, not in pages.
 */
import type {
  DecisionRecord,
  DiagnosticProblem,
  DtcObservation,
  EvidenceProvenance,
  FreezeFrame,
  KnownCampaign,
  Mode06Result,
  Recognition,
  Recommendation,
  SolutionHistory,
  VehicleProfile,
} from "@auto/semantic-types";

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

export interface ApiClientOptions {
  /** API origin. Empty string = same-origin (Vite proxies /api in dev). */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

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

export interface ForecastSummary {
  declining: boolean;
  series: Array<{ timestamp: string; value: number }>;
}

export interface CreateVehicleInput {
  make: string;
  model: string;
  year?: number | null;
  trim?: string | null;
  engineFamily: string;
  vin?: string;
}

export interface LogRepairInput {
  vehicleId: string;
  problemId: string;
  actionId: string;
  rationale: string;
  decidedBy: string;
  outcomeStatus?: "worked" | "partial" | "failed" | "inconclusive";
  note?: string;
}

const enc = (id: string) => encodeURIComponent(id);

export class AutoApiClient {
  private baseUrl: string;
  private fetchImpl?: typeof fetch;

  constructor(opts: ApiClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl;
  }

  /** Resolve fetch at call time so tests can stub `globalThis.fetch`. */
  private fetchFn(): typeof fetch {
    // Bind to globalThis: browsers throw "Illegal invocation" if fetch is
    // called with a receiver other than window.
    return this.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn()(`${this.baseUrl}${path}`, {
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
      const err = (
        body as { error?: { message?: string; code?: string; details?: unknown } } | undefined
      )?.error;
      throw new ApiError(
        err?.message ?? `Request to ${path} failed (HTTP ${res.status})`,
        res.status,
        err?.code,
        err?.details,
      );
    }
    return body as T;
  }

  // --- vehicles ------------------------------------------------------------
  listVehicles = () =>
    this.request<{ vehicles: VehicleProfile[] }>("/api/vehicles").then((r) => r.vehicles);
  getVehicle = (id: string) => this.request<VehicleProfile>(`/api/vehicles/${enc(id)}`);
  listEngineFamilies = () =>
    this.request<{ engineFamilies: EngineFamilySummary[] }>("/api/engine-families").then(
      (r) => r.engineFamilies,
    );
  createVehicle = (input: CreateVehicleInput) =>
    this.request<VehicleProfile>("/api/vehicles", {
      method: "POST",
      body: JSON.stringify(input),
    });

  // --- observations / evidence ----------------------------------------------
  getDtcs = (vehicleId: string) =>
    this.request<{ dtcs: DtcObservation[] }>(`/api/vehicles/${enc(vehicleId)}/dtcs`).then(
      (r) => r.dtcs,
    );
  getEvidenceProvenance = (vehicleId: string) =>
    this.request<EvidenceProvenance>(`/api/vehicles/${enc(vehicleId)}/evidence-provenance`);
  getSolutionHistory = (vehicleId: string, faultClass?: string) => {
    const q = faultClass ? `?class=${enc(faultClass)}` : "";
    return this.request<SolutionHistory>(`/api/vehicles/${enc(vehicleId)}/solution-history${q}`);
  };
  getFreezeFrames = (vehicleId: string) =>
    this.request<{ freezeFrames: FreezeFrame[] }>(
      `/api/vehicles/${enc(vehicleId)}/freeze-frame`,
    ).then((r) => r.freezeFrames);
  getMode06 = (vehicleId: string) =>
    this.request<{ results: Mode06Result[] }>(`/api/vehicles/${enc(vehicleId)}/mode06`).then(
      (r) => r.results,
    );
  getForecast = (vehicleId: string) =>
    this.request<ForecastSummary>(`/api/vehicles/${enc(vehicleId)}/forecast`);

  // --- recognition (LOGOS realize) ------------------------------------------
  getRecognition = (vehicleId: string) =>
    this.request<Recognition>(`/api/vehicles/${enc(vehicleId)}/recognition`);

  // --- recommendations -------------------------------------------------------
  getRecommendations = (vehicleId: string) =>
    this.request<{ recommendations: Recommendation[] }>(
      `/api/vehicles/${enc(vehicleId)}/recommendations`,
    ).then((r) => r.recommendations);
  refreshRecommendations = (vehicleId: string) =>
    this.request<{ recommendations: Recommendation[] }>(
      `/api/vehicles/${enc(vehicleId)}/recommendations/refresh`,
      { method: "POST" },
    ).then((r) => r.recommendations);
  markRecommendationStatus = (id: string, status: Recommendation["status"]) =>
    this.request<Recommendation>(`/api/recommendations/${enc(id)}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });

  // --- recall / TSB matcher ---------------------------------------------------
  getCampaigns = (vehicleId: string) =>
    this.request<{ campaigns: KnownCampaign[]; tsbs: TsbEntry[] }>(
      `/api/vehicles/${enc(vehicleId)}/campaigns`,
    );

  // --- diagnostic problems + policy -------------------------------------------
  listProblems = (vehicleId: string) =>
    this.request<{ problems: DiagnosticProblem[] }>(
      `/api/vehicles/${enc(vehicleId)}/problems`,
    ).then((r) => r.problems);
  getProblem = (id: string) => this.request<DiagnosticProblem>(`/api/problems/${enc(id)}`);
  createDiagnosticProblem = (input: { vehicleId: string; triggeredByClass: string }) =>
    this.request<DiagnosticProblem>("/api/actions/create-diagnostic-problem", {
      method: "POST",
      body: JSON.stringify(input),
    });
  solveDiagnosticProblem = (problemId: string) =>
    this.request<DiagnosticProblem>("/api/actions/solve-diagnostic-problem", {
      method: "POST",
      body: JSON.stringify({ problemId }),
    });
  logRepair = (input: LogRepairInput) =>
    this.request<DecisionRecord>("/api/actions/log-repair", {
      method: "POST",
      body: JSON.stringify(input),
    });
  requestClearCodesAndDrive = (vehicleId: string) =>
    this.request<{ allowed: true; obligations: string[] }>(
      `/api/vehicles/${enc(vehicleId)}/actions/clear-codes-and-drive`,
      { method: "POST" },
    );

  // --- decision journal --------------------------------------------------------
  listDecisions = (vehicleId: string) =>
    this.request<{ decisions: DecisionRecord[] }>(`/api/vehicles/${enc(vehicleId)}/decisions`).then(
      (r) => r.decisions,
    );
}

/** Factory — prefer this over `new` so tests can inject `fetchImpl`. */
export function createApiClient(opts: ApiClientOptions = {}): AutoApiClient {
  return new AutoApiClient(opts);
}

/**
 * TanStack Query key factory. Mutations must invalidate the relevant keys.
 * Pages should not invent parallel string keys for the same resources.
 */
export const queryKeys = {
  vehicles: () => ["vehicles"] as const,
  vehicle: (id: string) => ["vehicle", id] as const,
  engineFamilies: () => ["engineFamilies"] as const,
  dtcs: (vehicleId: string) => ["dtcs", vehicleId] as const,
  evidenceProvenance: (vehicleId: string) => ["evidenceProvenance", vehicleId] as const,
  freezeFrames: (vehicleId: string) => ["freezeFrames", vehicleId] as const,
  mode06: (vehicleId: string) => ["mode06", vehicleId] as const,
  forecast: (vehicleId: string) => ["forecast", vehicleId] as const,
  recognition: (vehicleId: string) => ["recognition", vehicleId] as const,
  recommendations: (vehicleId: string) => ["recommendations", vehicleId] as const,
  campaigns: (vehicleId: string) => ["campaigns", vehicleId] as const,
  problems: (vehicleId: string) => ["problems", vehicleId] as const,
  problem: (id: string) => ["problem", id] as const,
  decisions: (vehicleId: string) => ["decisions", vehicleId] as const,
  solutionHistory: (vehicleId: string, faultClass?: string) =>
    ["solutionHistory", vehicleId, faultClass ?? null] as const,
};
