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

  it("renders tables, code fences, and a custom title", () => {
    const html = markdownToPrintHtml(
      [
        "# Mastery",
        "",
        "| A | B |",
        "| --- | --- |",
        "| 1 | 2 |",
        "",
        "```",
        "scan",
        "```",
      ].join("\n"),
      { title: "Vehicle & OBD mastery" },
    );
    expect(html).toContain("<title>Vehicle &amp; OBD mastery</title>");
    expect(html).toContain("<table>");
    expect(html).toContain("<pre><code>scan</code></pre>");
    expect(html).toContain("Save as PDF");
  });
});
