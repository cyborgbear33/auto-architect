import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

describe("loadConfig", () => {
  it("listens on localhost and the local console origins by default", () => {
    const config = loadConfig({});
    expect(config.host).toBe("127.0.0.1");
    expect(config.corsOrigins).toEqual(["http://localhost:5173", "http://127.0.0.1:5173"]);
  });

  it("honors HOST and CORS_ORIGINS when the operator opts in", () => {
    const config = loadConfig({
      HOST: "0.0.0.0",
      CORS_ORIGINS: "http://192.168.1.20:5173, http://localhost:5173",
    });
    expect(config.host).toBe("0.0.0.0");
    expect(config.corsOrigins).toEqual(["http://192.168.1.20:5173", "http://localhost:5173"]);
  });
});
