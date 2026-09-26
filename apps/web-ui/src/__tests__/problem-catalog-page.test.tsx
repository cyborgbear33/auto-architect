import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { searchState, resetSearch } = vi.hoisted(() => {
  const state: { problem?: string } = {};
  return {
    searchState: state,
    resetSearch: () => {
      state.problem = undefined;
    },
  };
});

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => searchState,
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
  resetSearch();
});

vi.mock("../lib/api.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api.ts")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getVehicle: vi.fn().mockResolvedValue({
        id: "veh:jeep-renegade-2015-latitude",
        make: "Jeep",
        model: "Renegade",
        year: 2015,
        engineFamily: "fca-tigershark-2.4",
      }),
    },
  };
});

import { ProblemCatalog } from "../routes/ProblemCatalog.tsx";

describe("ProblemCatalog", () => {
  it("lists a fault class and an inspection, and filters by category", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ProblemCatalog />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Problems" })).toBeInTheDocument();
    expect(
      await screen.findByRole("rowheader", { name: /Misfire under load/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Brake pads thin/ })).toBeInTheDocument();
    expect(screen.getByText(/not a fault proved/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fluid" }));
    expect(screen.queryByRole("rowheader", { name: /Misfire under load/ })).not.toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Chronic oil consumption/i })).toBeInTheDocument();
  });

  it("searches by a trouble code", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ProblemCatalog />
      </QueryClientProvider>,
    );
    const search = await screen.findByRole("textbox", { name: /Search problems/ });
    fireEvent.change(search, { target: { value: "P0304" } });
    expect(screen.getByRole("rowheader", { name: /Misfire under load/ })).toBeInTheDocument();
    expect(screen.queryByRole("rowheader", { name: /Brake pads thin/ })).not.toBeInTheDocument();
  });

  it("fills search and category when opened from a diagnosed problem", async () => {
    searchState.problem = "CoolantThermostatFault";
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ProblemCatalog />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("textbox", { name: /Search problems/ })).toHaveValue(
      "Coolant thermostat fault",
    );
    expect(screen.getByRole("button", { name: "Fluid", pressed: true })).toBeInTheDocument();
    expect(screen.getByText(/Opened from diagnosis/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveValue("name");
  });
});
