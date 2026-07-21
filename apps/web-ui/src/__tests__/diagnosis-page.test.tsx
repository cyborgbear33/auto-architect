import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
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

const { FakeApiError } = vi.hoisted(() => ({
  FakeApiError: class FakeApiError extends Error {
    statusCode: number;
    code?: string;
    details?: unknown;
    constructor(message: string, statusCode: number, code?: string, details?: unknown) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
      this.details = details;
    }
  },
}));

vi.mock("../lib/api.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api.ts")>();
  return {
    ...actual,
    ApiError: FakeApiError,
    api: {
      getRecognition: vi.fn().mockResolvedValue({
        individual: "veh:jeep-renegade-2015-latitude",
        member: ["Engine", "MisfireUnderLoad"],
        mostSpecific: ["MisfireUnderLoad"],
        undecided: [],
      }),
      getEvidenceProvenance: vi.fn().mockResolvedValue({
        latestSource: "obd_gateway",
        latestCapturedAt: "2026-07-19T12:00:00.000Z",
        batchCount: 2,
        sourcesSeen: ["obd_gateway"],
      }),
      getSolutionHistory: vi.fn().mockResolvedValue({
        vehicleId: "veh:jeep-renegade-2015-latitude",
        engineFamily: "fca-tigershark-2.4",
        faultClassFilter: null,
        vehicle: [],
        engineFamilyRollup: [],
      }),
      getCaseTimeline: vi.fn().mockResolvedValue({
        vehicleId: "veh:jeep-renegade-2015-latitude",
        problemIdFilter: null,
        events: [],
      }),
      listProblems: vi.fn().mockResolvedValue([]),
      createDiagnosticProblem: vi.fn().mockResolvedValue({
        id: "problem:1",
        vehicleId: "veh:jeep-renegade-2015-latitude",
        status: "open",
        statement: { currentState: "a", desiredState: "b", gap: "c" },
        actions: [],
        triggeredByClass: "MisfireUnderLoad",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      }),
      abandonDiagnosticProblem: vi.fn(),
      escalateDiagnosticProblem: vi.fn(),
      verifyDiagnosticProblem: vi.fn(),
      reopenDiagnosticProblem: vi.fn(),
      requestClearCodesAndDrive: vi.fn(),
    },
  };
});

import { api } from "../lib/api.ts";
import { Diagnosis } from "../routes/Diagnosis.tsx";

afterEach(() => {
  resetMockUiState();
  vi.clearAllMocks();
  vi.mocked(api.listProblems).mockResolvedValue([]);
});

function renderDiagnosis() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Diagnosis />
    </QueryClientProvider>,
  );
}

describe("Diagnosis", () => {
  it("offers to draft a diagnostic problem for a proven, not-yet-drafted class", async () => {
    renderDiagnosis();
    const heading = await screen.findByText("Proven, not-yet-drafted fault classes");
    const section = within(heading.closest("section")!);
    const button = await section.findByRole("button", { name: "Draft diagnostic problem" });
    expect(section.getByText("MisfireUnderLoad")).toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() =>
      expect(api.createDiagnosticProblem).toHaveBeenCalledWith({
        vehicleId: "veh:jeep-renegade-2015-latitude",
        triggeredByClass: "MisfireUnderLoad",
      }),
    );
  });

  it("shows a green allowed message when clear-codes-and-drive is not blocked", async () => {
    vi.mocked(api.requestClearCodesAndDrive).mockResolvedValueOnce({
      allowed: true,
      obligations: [],
    });
    renderDiagnosis();
    fireEvent.click(await screen.findByRole("button", { name: "Request: clear codes and drive" }));
    expect(await screen.findByText(/Allowed\./)).toBeInTheDocument();
  });

  it("shows a red blocked message when the safety hold fires", async () => {
    vi.mocked(api.requestClearCodesAndDrive).mockRejectedValueOnce(
      new FakeApiError("blocked by R_forbid_clear_misfire", 403, "POLICY_BLOCKED"),
    );
    renderDiagnosis();
    fireEvent.click(await screen.findByRole("button", { name: "Request: clear codes and drive" }));
    expect(
      await screen.findByText(/Blocked: blocked by R_forbid_clear_misfire/),
    ).toBeInTheDocument();
  });

  it("hides draft when an active case already exists for the class (P3)", async () => {
    const problems = [
      {
        id: "problem:active",
        vehicleId: "veh:jeep-renegade-2015-latitude",
        status: "verifying" as const,
        statement: { currentState: "a", desiredState: "b", gap: "c" },
        actions: [],
        triggeredByClass: "MisfireUnderLoad",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      },
    ];
    vi.mocked(api.listProblems).mockImplementation(async () => problems);
    renderDiagnosis();
    await waitFor(() => expect(api.listProblems).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Run verify" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Draft diagnostic problem" })).toBeNull();
  });

  it("filters the caseboard and exposes lifecycle actions", async () => {
    vi.mocked(api.listProblems).mockImplementation(async () => [
      {
        id: "problem:open",
        vehicleId: "veh:jeep-renegade-2015-latitude",
        status: "open" as const,
        statement: { currentState: "misfire", desiredState: "smooth", gap: "coil" },
        actions: [],
        triggeredByClass: "MisfireUnderLoad",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      },
      {
        id: "problem:solved",
        vehicleId: "veh:jeep-renegade-2015-latitude",
        status: "solved" as const,
        statement: { currentState: "old", desiredState: "ok", gap: "fixed" },
        actions: [],
        triggeredByClass: "LeanCruise",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-03T00:00:00Z",
      },
    ]);
    vi.mocked(api.abandonDiagnosticProblem).mockResolvedValue({
      id: "problem:open",
      vehicleId: "veh:jeep-renegade-2015-latitude",
      status: "abandoned",
      statement: { currentState: "misfire", desiredState: "smooth", gap: "coil" },
      actions: [],
      triggeredByClass: "MisfireUnderLoad",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-04T00:00:00Z",
    });

    renderDiagnosis();
    const heading = await screen.findByText("Problem caseboard");
    const board = () => within(heading.closest("section")!);

    expect(await board().findByText("MisfireUnderLoad")).toBeInTheDocument();
    expect(board().queryByText("LeanCruise")).toBeNull();

    fireEvent.click(board().getByRole("button", { name: "Solved" }));
    expect(await board().findByText("LeanCruise")).toBeInTheDocument();
    expect(board().queryByText("MisfireUnderLoad")).toBeNull();

    fireEvent.click(board().getByRole("button", { name: "Active" }));
    fireEvent.click(await board().findByRole("button", { name: "Abandon" }));
    await waitFor(() => expect(api.abandonDiagnosticProblem).toHaveBeenCalledWith("problem:open"));
  });
});
