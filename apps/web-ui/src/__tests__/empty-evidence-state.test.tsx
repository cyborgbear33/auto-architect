import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { EmptyEvidenceState } from "../components/EmptyEvidenceState.tsx";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

describe("EmptyEvidenceState", () => {
  it("keeps the not-healthy honesty for empty DTCs", () => {
    render(<EmptyEvidenceState kind="dtcs" />);
    expect(screen.getByRole("status")).toHaveTextContent(/not the same as healthy/i);
  });

  it("offers ingest + guide links when requested", () => {
    render(<EmptyEvidenceState kind="pids" ingestLink />);
    expect(screen.getByText("Get evidence on file")).toHaveAttribute("href", "#evidence-ingest");
    expect(screen.getByText("Guide")).toHaveAttribute("href", "/guide");
  });
});
