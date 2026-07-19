import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "./index.ts";

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      text: async () => JSON.stringify(body),
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("@auto/api-client", () => {
  const api = createApiClient({ baseUrl: "" });

  it("GETs and unwraps the vehicles list", async () => {
    mockFetchOnce(200, { vehicles: [{ id: "veh:x" }] });
    const vehicles = await api.listVehicles();
    expect(vehicles).toEqual([{ id: "veh:x" }]);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/vehicles", expect.objectContaining({}));
  });

  it("URL-encodes vehicle ids containing colons/hyphens", async () => {
    mockFetchOnce(200, { dtcs: [] });
    await api.getDtcs("veh:jeep-renegade-2015-latitude");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/vehicles/veh%3Ajeep-renegade-2015-latitude/dtcs",
      expect.anything(),
    );
  });

  it("omits content-type on POST with no body", async () => {
    mockFetchOnce(200, { recommendations: [] });
    await api.refreshRecommendations("veh:x");
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string> | undefined;
    expect(headers?.["content-type"]).toBeUndefined();
  });

  it("throws ApiError with the server's message/code/details on a non-2xx response", async () => {
    mockFetchOnce(403, {
      error: { message: "blocked by policy", code: "POLICY_BLOCKED", details: { obligations: [] } },
    });
    await expect(api.requestClearCodesAndDrive("veh:x")).rejects.toMatchObject({
      message: "blocked by policy",
      statusCode: 403,
      code: "POLICY_BLOCKED",
    });
  });

  it("is an instance of ApiError", async () => {
    mockFetchOnce(500, { error: { message: "boom" } });
    try {
      await api.listVehicles();
      expect.fail("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
  });
});
