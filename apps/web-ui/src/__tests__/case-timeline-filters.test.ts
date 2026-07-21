import type { CaseTimelineEvent } from "@auto/semantic-types";
import { describe, expect, it } from "vitest";
import { applyTimelineFilters, type TimelineFilters } from "../components/CaseTimelinePanel.tsx";

function event(
  partial: Partial<CaseTimelineEvent> & Pick<CaseTimelineEvent, "id" | "type">,
): CaseTimelineEvent {
  return {
    at: "2026-07-10T12:00:00.000Z",
    problemId: "problem:1",
    vehicleId: "veh:x",
    summary: "test",
    ...partial,
  };
}

const base: TimelineFilters = {
  faultClass: "",
  eventType: "",
  dateFrom: "",
  dateTo: "",
  milesMin: "",
  milesMax: "",
};

describe("applyTimelineFilters (H4)", () => {
  const events = [
    event({
      id: "a",
      type: "opened",
      faultClass: "MisfireUnderLoad",
      at: "2026-07-01T10:00:00.000Z",
      odometerMiles: 40000,
    }),
    event({
      id: "b",
      type: "repair_logged",
      faultClass: "CamCrankCorrelationFault",
      at: "2026-07-15T10:00:00.000Z",
      odometerMiles: 40500,
      sessionId: "session:1",
    }),
    event({
      id: "c",
      type: "abandoned",
      faultClass: "MisfireUnderLoad",
      at: "2026-07-20T10:00:00.000Z",
      odometerMiles: 41000,
    }),
  ];

  it("filters by fault class substring", () => {
    const out = applyTimelineFilters(events, { ...base, faultClass: "misfire" });
    expect(out.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("filters by event type", () => {
    const out = applyTimelineFilters(events, { ...base, eventType: "repair_logged" });
    expect(out.map((e) => e.id)).toEqual(["b"]);
  });

  it("filters by date range", () => {
    const out = applyTimelineFilters(events, {
      ...base,
      dateFrom: "2026-07-10",
      dateTo: "2026-07-18",
    });
    expect(out.map((e) => e.id)).toEqual(["b"]);
  });

  it("filters by mileage band", () => {
    const out = applyTimelineFilters(events, { ...base, milesMin: "40200", milesMax: "40800" });
    expect(out.map((e) => e.id)).toEqual(["b"]);
  });
});
