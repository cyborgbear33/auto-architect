/**
 * Web-ui entry to the shared typed client. Pages import from here (or from
 * `@auto/api-client` directly). Vite `VITE_API_URL` is applied once — do not
 * invent a second fetch helper beside `@auto/api-client`.
 */
import { createApiClient } from "@auto/api-client";

export {
  ApiError,
  AutoApiClient,
  type CreateVehicleInput,
  createApiClient,
  type EngineFamilySummary,
  type ForecastSummary,
  type LogRepairInput,
  queryKeys,
  type TsbEntry,
} from "@auto/api-client";

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "",
});
