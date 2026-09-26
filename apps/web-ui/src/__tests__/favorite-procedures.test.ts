import { afterEach, describe, expect, it } from "vitest";
import { loadFavoriteProcedureIds, setFavoriteProcedure } from "../lib/favoriteProcedures.ts";

afterEach(() => {
  window.localStorage.clear();
});

describe("favoriteProcedures", () => {
  it("starts empty and toggles one procedure id", () => {
    expect(loadFavoriteProcedureIds()).toEqual([]);
    expect(setFavoriteProcedure("proc:fca-proxi-alignment", true)).toEqual([
      "proc:fca-proxi-alignment",
    ]);
    expect(loadFavoriteProcedureIds()).toEqual(["proc:fca-proxi-alignment"]);
    expect(setFavoriteProcedure("proc:fca-proxi-alignment", false)).toEqual([]);
  });

  it("does not duplicate an id that is already pinned", () => {
    setFavoriteProcedure("proc:fca-proxi-alignment", true);
    expect(setFavoriteProcedure("proc:fca-proxi-alignment", true)).toEqual([
      "proc:fca-proxi-alignment",
    ]);
  });
});
