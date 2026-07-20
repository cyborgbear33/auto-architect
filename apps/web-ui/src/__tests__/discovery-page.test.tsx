import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
      getDiscovery: vi.fn().mockResolvedValue({
        vehicleId: "veh:jeep-renegade-2015-latitude",
        capturedAt: "2026-07-20T12:00:00.000Z",
        source: "simulated",
        vehicle: {
          make: "Jeep",
          model: "Renegade",
          year: 2015,
          trim: "Latitude",
          engineFamily: "fca-tigershark-2.4",
          profileObdProtocol: "ISO 15765-4",
        },
        hardware: {
          preferredAdapter: "OBDLink MX+",
          adapterNotes: ["Jeep Renegade: use a gray-type OBD-II adapter/extension."],
          connection: {
            connected: false,
            port: null,
            protocolId: null,
            protocolName: null,
          },
        },
        summary: {
          mode01Supported: 0,
          mode01Unsupported: 0,
          mode01Unknown: 12,
          mode06Supported: 0,
          mode06Unsupported: 0,
          mode06Unknown: 4,
          freezeFrame: null,
          mode03Dtcs: null,
          mode07Pending: null,
          vin: null,
          unmappedSupportedPids: 0,
          cartridgeRelevantAvailable: 0,
        },
        mode01: [
          {
            pid: "RPM",
            support: "unknown",
            description: "Engine RPM",
            unit: "rpm",
            pidHex: "0x0C",
            inOntology: true,
            inDefaultPoll: true,
            cartridgeRelevant: true,
          },
          {
            pid: "ENGINE_LOAD",
            support: "unknown",
            description: "Calculated engine load",
            unit: "%",
            pidHex: "0x04",
            inOntology: true,
            inDefaultPoll: true,
            cartridgeRelevant: true,
          },
        ],
        mode06: [
          {
            mid: "21",
            support: "unknown",
            description: "Catalyst monitor bank 1",
            concept: "FailedCatalystMonitor",
            inOntology: true,
          },
        ],
        unmappedSupportedPids: [],
        narrative: ["Simulated discovery catalog — run live discover for ECU support."],
        markdown: "# Vehicle intelligence",
        html: "<h1>Vehicle intelligence</h1>",
      }),
      getDiscoveryReport: vi.fn(),
    },
  };
});

import { Discovery } from "../routes/Discovery.tsx";

describe("Discovery", () => {
  it("renders forensics summary and Mode 01 rows", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Discovery />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Discovery" })).toBeInTheDocument();
    expect(await screen.findByText(/2015 Jeep Renegade/)).toBeInTheDocument();
    expect(screen.getByText(/gray-type OBD-II adapter/i)).toBeInTheDocument();
    expect(screen.getByText("Mode 01 PIDs")).toBeInTheDocument();
    expect(screen.getByText("RPM")).toBeInTheDocument();
    expect(screen.getByText("ENGINE_LOAD")).toBeInTheDocument();
    expect(screen.getByText("Mode 06 MIDs")).toBeInTheDocument();
    expect(screen.getByText("21")).toBeInTheDocument();
  });
});
