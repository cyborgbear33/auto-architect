import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
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
      getSpecialProcedures: vi.fn().mockResolvedValue([
        {
          id: "proc:fca-proxi-alignment",
          title: "Proxi alignment (module configuration sync)",
          engineFamily: "fca-tigershark-2.4",
          executionMode: "external_enhanced_tool",
          summary: "BCM Proxi master sync after battery events.",
          triggers: ["Stuck in Park", "Flashing odometer"],
          modulesInvolved: [{ id: "BCM", role: "Proxi master" }],
          detectSteps: ["Scan all modules with AlfaOBD"],
          alignSteps: ["Body computer → PROXI alignment; gray adapter when prompted"],
          verifySteps: ["Shift out of Park"],
          hardware: ["OBDLink MX+", "Gray adapter"],
          risks: ["Gateway cannot send Proxi"],
          references: ["Public Renegade Proxi reports"],
        },
      ]),
      startSpecialProcedure: vi.fn().mockResolvedValue({
        problem: { id: "problem:proxi-1" },
        decision: { id: "decision:1" },
        procedureId: "proc:fca-proxi-alignment",
      }),
      completeSpecialProcedure: vi.fn(),
    },
  };
});

import { Functions } from "../routes/Functions.tsx";

describe("Functions", () => {
  it("shows Proxi alignment with external-tool banner and start CTA", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Functions />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Functions" })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", {
        name: "Proxi alignment (module configuration sync)",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/External tool required/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start guided run/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Body computer → PROXI alignment; gray adapter when prompted/i),
    ).toBeInTheDocument();
  });

  it("starts a guided run and enables complete actions", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Functions />
      </QueryClientProvider>,
    );

    const start = await screen.findByRole("button", { name: /Start guided run/i });
    fireEvent.click(start);

    expect(await screen.findByText(/Active case:/)).toBeInTheDocument();
    expect(screen.getByText("problem:proxi-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mark completed/i })).toBeInTheDocument();
  });
});
