import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  useNavigate: () => vi.fn(),
}));

const { mockUiState, resetMockUiState } = vi.hoisted(() => {
  const defaults = { selectedVehicleId: "veh:jeep-renegade-2015-latitude", debugMode: false };
  const state: typeof defaults = { ...defaults };
  return { mockUiState: state, resetMockUiState: () => Object.assign(state, defaults) };
});

vi.mock("../store/index.ts", () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: (s: { ui: typeof mockUiState }) => unknown) =>
    selector({ ui: mockUiState }),
}));

afterEach(() => resetMockUiState());

vi.mock("../lib/api.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api.ts")>();
  return {
    ...actual,
    api: {
      listVehicles: vi.fn().mockResolvedValue([
        {
          id: "veh:jeep-renegade-2015-latitude",
          make: "Jeep",
          model: "Renegade",
          year: 2015,
          trim: "Latitude",
          engineFamily: "fca-tigershark-2.4",
        },
      ]),
      getVehicle: vi.fn().mockResolvedValue({
        id: "veh:jeep-renegade-2015-latitude",
        make: "Jeep",
        model: "Renegade",
        year: 2015,
        trim: "Latitude",
        engineFamily: "fca-tigershark-2.4",
      }),
      getDtcs: vi
        .fn()
        .mockResolvedValue([
          { code: "P0304", status: "stored", description: "Cylinder 4 Misfire" },
        ]),
      getEvidenceProvenance: vi.fn().mockResolvedValue({
        latestSource: "simulated",
        latestCapturedAt: "2026-07-19T12:00:00.000Z",
        batchCount: 1,
        sourcesSeen: ["simulated"],
      }),
      getLiveGauges: vi.fn().mockResolvedValue({
        vehicleId: "veh:jeep-renegade-2015-latitude",
        source: "simulated",
        capturedAt: new Date().toISOString(),
        ageMs: 500,
        stale: false,
        staleAfterMs: 15_000,
        gauges: [
          {
            pid: "RPM",
            label: "RPM",
            value: 2100,
            unit: "rpm",
            timestamp: new Date().toISOString(),
          },
          {
            pid: "ENGINE_LOAD",
            label: "Load",
            value: 42,
            unit: "percent",
            timestamp: new Date().toISOString(),
          },
          {
            pid: "SHORT_FUEL_TRIM_1",
            label: "STFT B1",
            value: 8.5,
            unit: "percent",
            timestamp: new Date().toISOString(),
          },
          {
            pid: "COOLANT_TEMP",
            label: "Coolant",
            value: 91,
            unit: "celsius",
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      getFreezeFrames: vi.fn().mockResolvedValue([]),
      getMode06: vi.fn().mockResolvedValue([]),
      getVehicleReport: vi.fn().mockResolvedValue({
        scope: "vehicle",
        vehicleId: "veh:jeep-renegade-2015-latitude",
        generatedAt: "2026-07-19T12:00:00.000Z",
        markdown: "# report",
        html: "<html><body>report</body></html>",
        lastSession: null,
      }),
      listDriveSessions: vi.fn().mockResolvedValue([]),
      simulateDriveSession: vi.fn(),
      pruneObservations: vi.fn(),
      getForecast: vi.fn().mockResolvedValue({
        declining: false,
        series: [],
        signals: [],
        recognitionTrends: [],
        sessionId: null,
        scope: "vehicle",
      }),
      getRecognition: vi.fn().mockResolvedValue({
        individual: "veh:jeep-renegade-2015-latitude",
        member: ["Engine", "MisfireUnderLoad"],
        mostSpecific: ["MisfireUnderLoad"],
        undecided: [],
        narration: [
          {
            className: "MisfireUnderLoad",
            fluent: "P0300-P0304 + high load evidence.",
            source: "ontology_note",
          },
        ],
        classEvidence: [
          {
            className: "MisfireUnderLoad",
            dtcs: [{ code: "P0304", status: "stored", description: "Cylinder 4 Misfire" }],
            pids: [],
            freezeFrames: [],
            mode06: [],
          },
        ],
      }),
      getSolutionHistory: vi.fn().mockResolvedValue({
        vehicleId: "veh:jeep-renegade-2015-latitude",
        engineFamily: "fca-tigershark-2.4",
        faultClassFilter: "MisfireUnderLoad",
        vehicle: [
          {
            actionId: "swap-coil-plug",
            faultClass: "MisfireUnderLoad",
            scope: "vehicle",
            engineFamily: "fca-tigershark-2.4",
            worked: 2,
            partial: 0,
            failed: 0,
            inconclusive: 0,
            totalWithOutcome: 2,
            lastDecidedAt: "2026-01-01T00:00:00Z",
          },
        ],
        engineFamilyRollup: [],
      }),
      getRecommendations: vi.fn().mockResolvedValue([
        {
          id: "rec:1",
          vehicleId: "veh:jeep-renegade-2015-latitude",
          title: "Jeep Renegade: cylinder misfire under load",
          priority: "high",
          status: "new",
          reason: "a sustained misfire can destroy the catalytic converter",
          confidence: 0.82,
          cost: 0.25,
          risk: 0.1,
          suggestedActionId: "swap-coil-plug",
          generatedFromClasses: ["MisfireUnderLoad"],
          createdAt: "2026-01-01T00:00:00Z",
        },
      ]),
      listProblems: vi.fn().mockResolvedValue([]),
      refreshRecommendations: vi.fn(),
      markRecommendationStatus: vi.fn(),
      convertRecommendation: vi.fn(),
    },
  };
});

import { Dashboard } from "../routes/Dashboard.tsx";

describe("Dashboard", () => {
  it("shows the vehicle's DTCs with their status", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Dashboard />
      </QueryClientProvider>,
    );
    const heading = await screen.findByText("Active DTCs");
    const section = within(heading.closest("section")!);
    expect(await section.findByText("P0304")).toBeInTheDocument();
    expect(section.getByText("Cylinder 4 Misfire")).toBeInTheDocument();
    expect(section.getByText("stored")).toBeInTheDocument();
  });

  it("falls back to the DTC dictionary when the API omits description", async () => {
    const { api } = await import("../lib/api.ts");
    vi.mocked(api.getDtcs).mockResolvedValueOnce([{ code: "P0304", status: "stored" }]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Dashboard />
      </QueryClientProvider>,
    );
    const heading = await screen.findByText("Active DTCs");
    const section = within(heading.closest("section")!);
    expect(await section.findByText("Cylinder 4 Misfire Detected")).toBeInTheDocument();
  });

  it("labels evidence source so simulated data is never mistaken for live OBD", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Dashboard />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Latest evidence: Simulated/)).toBeInTheDocument();
  });

  it("leads with an at-a-glance next action from the top recommendation", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Dashboard />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("At a glance")).toBeInTheDocument();
    expect(
      await screen.findByText(/Next: Jeep Renegade: cylinder misfire under load/),
    ).toBeInTheDocument();
  });

  it("shows verified-fix chips on DTC rows joined via classEvidence", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Dashboard />
      </QueryClientProvider>,
    );
    const heading = await screen.findByText("Active DTCs");
    const section = within(heading.closest("section")!);
    expect(await section.findByText("swap-coil-plug")).toBeInTheDocument();
    expect(section.getByText("Worked")).toBeInTheDocument();
    expect(section.getByText("n=2")).toBeInTheDocument();
  });

  it("offers Dashboard evidence ingest without hardware", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Dashboard />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Get evidence on file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Simulate drive session/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import OBD log/i })).toBeInTheDocument();
  });

  it("shows the live gauge strip with units", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Dashboard />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Live gauges")).toBeInTheDocument();
    expect(await screen.findByText("2100")).toBeInTheDocument();
    expect(screen.getByText("rpm")).toBeInTheDocument();
    expect(screen.getByText(/Fresh/)).toBeInTheDocument();
  });

  it("shows proven fault classes from recognition, never a synthesized Healthy", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Dashboard />
      </QueryClientProvider>,
    );
    const heading = await screen.findByText("Proven fault classes (LOGOS realize)");
    const section = within(heading.closest("section")!);
    expect(await section.findByText("MisfireUnderLoad")).toBeInTheDocument();
    expect(section.queryByText("Healthy")).not.toBeInTheDocument();
  });

  it("shows recommendation cards with priority, cost/risk, and lifecycle actions", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Dashboard />
      </QueryClientProvider>,
    );
    const heading = await screen.findByText("Recommendations");
    const section = within(heading.closest("section")!);
    expect(await section.findByText(/cylinder misfire under load/)).toBeInTheDocument();
    expect(section.getByText("high")).toBeInTheDocument();
    expect(section.getByText(/conf 82%/)).toBeInTheDocument();
    expect(section.getByText(/cost 25%/)).toBeInTheDocument();
    expect(section.getByText(/risk 10%/)).toBeInTheDocument();
    expect(section.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(section.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(section.getByRole("button", { name: "Convert to case" })).toBeInTheDocument();
  });

  it("shows an empty-vehicle state when nothing is selected", async () => {
    mockUiState.selectedVehicleId = "";
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Dashboard />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/No vehicle selected/)).toBeInTheDocument();
  });
});
