import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    onClick,
  }: {
    children: React.ReactNode;
    to: string;
    onClick?: () => void;
  }) => (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  ),
  Outlet: () => <div>page</div>,
}));

vi.mock("../store/index.ts", () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (
    selector: (s: { ui: { selectedVehicleId: string; debugMode: boolean } }) => unknown,
  ) =>
    selector({
      ui: { selectedVehicleId: "veh:jeep-renegade-2015-latitude", debugMode: false },
    }),
}));

vi.mock("../lib/api.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api.ts")>();
  return {
    ...actual,
    api: {
      ...actual.api,
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
    },
  };
});

import { Layout } from "../components/Layout.tsx";

describe("Layout navigation", () => {
  it("groups destinations by job and keeps the vehicle control labeled", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Layout />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    for (const group of ["Operate", "Diagnose", "Learn", "Procedures", "Reference", "History"]) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Guide" })).toHaveAttribute("href", "/guide");
    expect(screen.getByRole("link", { name: "Recalls & TSBs" })).toHaveAttribute(
      "href",
      "/campaigns",
    );
    expect(await screen.findByRole("combobox", { name: "Vehicle" })).toHaveValue(
      "veh:jeep-renegade-2015-latitude",
    );
    expect(screen.getByText("Technical detail")).toBeInTheDocument();
  });

  it("opens and closes the narrow-screen menu", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Layout />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Menu" })).toBeInTheDocument();
  });
});
