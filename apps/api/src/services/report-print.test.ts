import { describe, expect, it } from "vitest";
import { markdownToPrintHtml } from "./report.ts";

describe("markdownToPrintHtml", () => {
  it("emits print CSS and converts headings / lists", () => {
    const html = markdownToPrintHtml(
      ["# Diagnostic report — Jeep", "", "## Proven fault classes", "- **MisfireUnderLoad**"].join(
        "\n",
      ),
    );
    expect(html).toContain("@media print");
    expect(html).toContain("<h1>");
    expect(html).toContain("<h2>");
    expect(html).toContain("<strong>MisfireUnderLoad</strong>");
    expect(html).toContain("no-print");
  });
});
