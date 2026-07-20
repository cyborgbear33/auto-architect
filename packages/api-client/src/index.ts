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
  CaseTimeline,
  DecisionRecord,
  DiagnosticProblem,
  DriveSession,
  DriveSessionSummary,
  DtcObservation,
  EvidenceProvenance,
  FreezeFrame,
  GarageDump,
  GarageImportResult,
  KnownCampaign,
  LiveGaugeStrip,
  Mode06Result,
  ObservationBatch,
  Recognition,
  Recommendation,
  RetentionResult,
  SolutionHistory,
  VehicleProfile,
} from "@auto/semantic-types";

export type DiagnosticReportDto = {
  scope: "vehicle" | "problem";
  vehicleId: string;
  problemId?: string;
  generatedAt: string;
  markdown: string;
  html: string;
  lastSession: DriveSessionSummary | null;
};

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

export interface SignalTrend {
  id: string;
  pid: string;
  label: string;
  series: Array<{ timestamp: string; value: number }>;
  direction: "rising" | "falling" | "flat" | "unknown";
  flagged: boolean;
  flagReason?: string;
  ontologyTrend?: string;
}

export interface ForecastSummary {
  declining: boolean;
  series: Array<{ timestamp: string; value: number }>;
  signals: SignalTrend[];
  recognitionTrends: string[];
  sessionId: string | null;
  scope: "vehicle" | "session";
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

  private async requestText(path: string, init?: RequestInit): Promise<string> {
    const res = await this.fetchFn()(`${this.baseUrl}${path}`, init);
    const text = await res.text();
    if (!res.ok) {
      let message = text || res.statusText;
      try {
        const body = text ? JSON.parse(text) : undefined;
        message = (body as { error?: { message?: string } } | undefined)?.error?.message ?? message;
      } catch {
        /* raw text error */
      }
      throw new ApiError(message, res.status);
    }
    return text;
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
  getLiveGauges = (vehicleId: string) =>
    this.request<LiveGaugeStrip>(`/api/vehicles/${enc(vehicleId)}/live-gauges`);
  listObservationBatches = (vehicleId: string) =>
    this.request<{ batches: ObservationBatch[] }>(
      `/api/vehicles/${enc(vehicleId)}/observation-batches`,
    ).then((r) => r.batches);
  pruneObservations = (vehicleId: string) =>
    this.request<RetentionResult>(`/api/vehicles/${enc(vehicleId)}/observations/prune`, {
      method: "POST",
    });
  listDriveSessions = (vehicleId: string) =>
    this.request<{ sessions: DriveSession[] }>(`/api/vehicles/${enc(vehicleId)}/sessions`).then(
      (r) => r.sessions,
    );
  startDriveSession = (input: {
    vehicleId: string;
    label?: string;
    source?: ObservationBatch["source"];
    odometerStartMiles?: number;
  }) =>
    this.request<DriveSession>("/api/actions/start-drive-session", {
      method: "POST",
      body: JSON.stringify(input),
    });
  endDriveSession = (sessionId: string, odometerEndMiles?: number) =>
    this.request<DriveSession>("/api/actions/end-drive-session", {
      method: "POST",
      body: JSON.stringify({ sessionId, odometerEndMiles }),
    });
  simulateDriveSession = (vehicleId: string, label?: string) =>
    this.request<{ session: DriveSession; batches: ObservationBatch[] }>(
      "/api/actions/simulate-drive-session",
      {
        method: "POST",
        body: JSON.stringify({ vehicleId, label }),
      },
    );
  getSolutionHistory = (vehicleId: string, faultClass?: string) => {
    const q = faultClass ? `?class=${enc(faultClass)}` : "";
    return this.request<SolutionHistory>(`/api/vehicles/${enc(vehicleId)}/solution-history${q}`);
  };
  getCaseTimeline = (vehicleId: string, problemId?: string) => {
    const q = problemId ? `?problemId=${enc(problemId)}` : "";
    return this.request<CaseTimeline>(`/api/vehicles/${enc(vehicleId)}/case-timeline${q}`);
  };

  // --- garage export / import -------------------------------------------------
  exportGarage = () => this.request<GarageDump>("/api/garage/export");
  exportVehicle = (vehicleId: string) =>
    this.request<GarageDump>(`/api/vehicles/${enc(vehicleId)}/export`);
  importGarage = (dump: GarageDump) =>
    this.request<GarageImportResult>("/api/garage/import", {
      method: "POST",
      body: JSON.stringify(dump),
    });
  exportObservationsCsv = (vehicleId: string) =>
    this.requestText(`/api/vehicles/${enc(vehicleId)}/export/observations.csv`);
  exportDtcsCsv = (vehicleId: string) =>
    this.requestText(`/api/vehicles/${enc(vehicleId)}/export/dtcs.csv`);
  exportDecisionsCsv = (vehicleId: string) =>
    this.requestText(`/api/vehicles/${enc(vehicleId)}/export/decisions.csv`);
  exportProblemsCsv = (vehicleId: string) =>
    this.requestText(`/api/vehicles/${enc(vehicleId)}/export/problems.csv`);
  exportTimelineCsv = (vehicleId: string) =>
    this.requestText(`/api/vehicles/${enc(vehicleId)}/export/timeline.csv`);
  getVehicleReport = (vehicleId: string) =>
    this.request<DiagnosticReportDto>(`/api/vehicles/${enc(vehicleId)}/report`);
  getProblemReport = (problemId: string) =>
    this.request<DiagnosticReportDto>(`/api/problems/${enc(problemId)}/report`);
  getFreezeFrames = (vehicleId: string) =>
    this.request<{ freezeFrames: FreezeFrame[] }>(
      `/api/vehicles/${enc(vehicleId)}/freeze-frame`,
    ).then((r) => r.freezeFrames);
  getMode06 = (vehicleId: string) =>
    this.request<{ results: Mode06Result[] }>(`/api/vehicles/${enc(vehicleId)}/mode06`).then(
      (r) => r.results,
    );
  getForecast = (vehicleId: string, sessionId?: string) => {
    const q = sessionId ? `?sessionId=${enc(sessionId)}` : "";
    return this.request<ForecastSummary>(`/api/vehicles/${enc(vehicleId)}/forecast${q}`);
  };

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
  verifyDiagnosticProblem = (problemId: string, note?: string) =>
    this.request<DiagnosticProblem>("/api/actions/verify-diagnostic-problem", {
      method: "POST",
      body: JSON.stringify({ problemId, note }),
    });
  abandonDiagnosticProblem = (problemId: string, note?: string) =>
    this.request<DiagnosticProblem>("/api/actions/abandon-diagnostic-problem", {
      method: "POST",
      body: JSON.stringify({ problemId, note }),
    });
  escalateDiagnosticProblem = (problemId: string, note?: string) =>
    this.request<DiagnosticProblem>("/api/actions/escalate-diagnostic-problem", {
      method: "POST",
      body: JSON.stringify({ problemId, note }),
    });
  reopenDiagnosticProblem = (problemId: string, note?: string) =>
    this.request<DiagnosticProblem>("/api/actions/reopen-diagnostic-problem", {
      method: "POST",
      body: JSON.stringify({ problemId, note }),
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
  liveGauges: (vehicleId: string) => ["liveGauges", vehicleId] as const,
  freezeFrames: (vehicleId: string) => ["freezeFrames", vehicleId] as const,
  mode06: (vehicleId: string) => ["mode06", vehicleId] as const,
  forecast: (vehicleId: string, sessionId?: string | null) =>
    ["forecast", vehicleId, sessionId ?? null] as const,
  recognition: (vehicleId: string) => ["recognition", vehicleId] as const,
  recommendations: (vehicleId: string) => ["recommendations", vehicleId] as const,
  campaigns: (vehicleId: string) => ["campaigns", vehicleId] as const,
  problems: (vehicleId: string) => ["problems", vehicleId] as const,
  problem: (id: string) => ["problem", id] as const,
  decisions: (vehicleId: string) => ["decisions", vehicleId] as const,
  driveSessions: (vehicleId: string) => ["driveSessions", vehicleId] as const,
  observationBatches: (vehicleId: string) => ["observationBatches", vehicleId] as const,
  solutionHistory: (vehicleId: string, faultClass?: string) =>
    ["solutionHistory", vehicleId, faultClass ?? null] as const,
  caseTimeline: (vehicleId: string, problemId?: string) =>
    ["caseTimeline", vehicleId, problemId ?? null] as const,
  vehicleReport: (vehicleId: string) => ["vehicleReport", vehicleId] as const,
  problemReport: (problemId: string) => ["problemReport", problemId] as const,
};
