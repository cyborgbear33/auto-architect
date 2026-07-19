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

afterEach(() => {
  resetMockUiState();
  vi.clearAllMocks();
});

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

vi.mock("../lib/api.ts", () => ({
  ApiError: FakeApiError,
  api: {
    getRecognition: vi.fn().mockResolvedValue({
      individual: "veh:jeep-renegade-2015-latitude",
      member: ["Engine", "MisfireUnderLoad"],
      mostSpecific: ["MisfireUnderLoad"],
      undecided: [],
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
    requestClearCodesAndDrive: vi.fn(),
  },
}));

import { api } from "../lib/api.ts";
import { Diagnosis } from "../routes/Diagnosis.tsx";

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
});
