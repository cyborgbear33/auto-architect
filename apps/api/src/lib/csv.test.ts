import { describe, expect, it } from "vitest";
import { toCsv } from "./csv.ts";

describe("toCsv", () => {
  it("quotes commas and doubles embedded quotes (RFC 4180)", () => {
    const csv = toCsv(
      [{ a: "hello, world", b: 'say "hi"' }],
      [
        { key: "a", header: "a" },
        { key: "b", header: "b" },
      ],
    );
    expect(csv).toBe('a,b\n"hello, world","say ""hi"""\n');
  });

  it("emits header-only CSV for empty rows", () => {
    expect(toCsv([], [{ key: "id", header: "id" }])).toBe("id\n");
  });
});
