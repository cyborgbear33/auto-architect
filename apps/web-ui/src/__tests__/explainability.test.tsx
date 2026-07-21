import type { Counterfactual, DisqualifiedAction } from "@auto/semantic-types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CalibrationExplainChip,
  CounterfactualsPanel,
  DisqualifiedActionsPanel,
} from "../components/Explainability.tsx";

describe("Explainability panels (D2/F5)", () => {
  it("renders calibration explain chip with sample meta", () => {
    render(
      <CalibrationExplainChip
        explain="swap-coil-4 worked 3/3 on this vehicle — priority raised one step"
        meta={{ scope: "vehicle", sampleSize: 3 }}
      />,
    );
    expect(screen.getByText(/Why this rank/i)).toBeInTheDocument();
    expect(screen.getByText(/n=3/)).toBeInTheDocument();
    expect(screen.getByText(/swap-coil-4 worked 3\/3/)).toBeInTheDocument();
  });

  it("lists disqualified actions with violated constraints", () => {
    const items: DisqualifiedAction[] = [
      { actionId: "clear-codes", violatedConstraints: ["never-clear-under-oil-starvation"] },
    ];
    render(<DisqualifiedActionsPanel items={items} />);
    expect(screen.getByText(/Disqualified actions/i)).toBeInTheDocument();
    expect(screen.getByText("clear-codes")).toBeInTheDocument();
    expect(screen.getByText(/never-clear-under-oil-starvation/)).toBeInTheDocument();
  });

  it("explains counterfactual flips for non-top actions", () => {
    const items: Counterfactual[] = [
      {
        actionId: "top-fix",
        score: 0.9,
        isTop: true,
        rank: 1,
        robustness: [
          { factor: "confidence", current: 0.8, breakEven: 0.65, direction: "falls_below" },
        ],
      },
      {
        actionId: "runner-up",
        score: 0.5,
        isTop: false,
        rank: 2,
        flips: [{ factor: "confidence", current: 0.4, needed: 0.85, direction: "increase" }],
      },
    ];
    render(<CounterfactualsPanel items={items} />);
    expect(screen.getByText(/Why this ranking/i)).toBeInTheDocument();
    expect(screen.getByText(/Stays #1 unless confidence falls below/)).toBeInTheDocument();
    expect(screen.getByText(/Would need confidence increase/)).toBeInTheDocument();
  });
});
