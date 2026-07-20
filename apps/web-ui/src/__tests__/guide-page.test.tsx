import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
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

vi.mock("../lib/api.ts", () => ({
  api: {
    getMasteryGuide: vi.fn().mockResolvedValue({
      vehicleId: "veh:jeep-renegade-2015-latitude",
      title: "Vehicle & OBD mastery — 2015 Jeep Renegade",
      generatedAt: "2026-07-20T16:00:00.000Z",
      sections: [
        {
          id: "how-to-use-this-guide",
          title: "How to use this guide",
          markdown: "Work the chapters in order the first time.",
        },
        {
          id: "3-discovery-verify-capabilities-first",
          title: "3. Discovery — verify capabilities first",
          markdown: "Discovery answers: what standard OBD-II information is available.",
        },
        {
          id: "6-troubleshooting",
          title: "6. Troubleshooting",
          markdown: "- Ignition on; reseat gray adapter + MX+",
        },
      ],
      markdown: "# Vehicle & OBD mastery — 2015 Jeep Renegade\n\n## How to use this guide\n",
      html: "<html><body><h1>Vehicle & OBD mastery</h1></body></html>",
    }),
  },
  queryKeys: {
    masteryGuide: (id: string) => ["masteryGuide", id] as const,
  },
}));

import { api } from "../lib/api.ts";
import { Guide } from "../routes/Guide.tsx";

describe("Guide", () => {
  it("mock api resolves mastery guide", async () => {
    const doc = await api.getMasteryGuide("veh:jeep-renegade-2015-latitude");
    expect(doc.sections).toHaveLength(3);
  });

  it("renders chapters and lets the operator navigate Discovery chapter", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Guide />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Guide" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Download Markdown/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Print \/ Save PDF/i })).toBeInTheDocument();
    expect(screen.getByText(/Work the chapters in order/i)).toBeInTheDocument();

    const chapterButtons = screen.getAllByRole("button", {
      name: /Discovery — verify capabilities first/i,
    });
    fireEvent.click(chapterButtons[0]!);
    expect(
      await screen.findByText(/what standard OBD-II information is available/i),
    ).toBeInTheDocument();
  });
});
