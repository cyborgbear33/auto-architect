# API_CLIENT_DEV_GUIDE.md

## Purpose

`@auto/api-client` is the typed bridge between UI (and future tools) and the
Fastify API. It centralizes paths, encoding, error shape, and TanStack Query
keys so pages cannot invent parallel contracts.

## Rules

The client must:

- use typed request/response models from `@auto/semantic-types`
- preserve semantic IDs (encode path segments with `encodeURIComponent`)
- expose domain-oriented methods (`getRecognition`, `listProblems`, …)
- centralize API error handling via `ApiError` (`statusCode`, `code`, `details`)
- send `Content-Type: application/json` **only when there is a body**
- own the `queryKeys` factory used by every page mutation/invalidation

## Usage

```ts
import { createApiClient, queryKeys } from "@auto/api-client";

const api = createApiClient({ baseUrl: import.meta.env.VITE_API_URL ?? "" });

const q = useQuery({
  queryKey: queryKeys.recognition(vehicleId),
  queryFn: () => api.getRecognition(vehicleId),
  enabled: Boolean(vehicleId),
});
```

In `apps/web-ui`, prefer importing from `src/lib/api.ts` (singleton + Vite
`baseUrl`). Do not add a second fetch helper beside `@auto/api-client`.

## TanStack Query keys

```ts
export const queryKeys = {
  vehicles: () => ["vehicles"] as const,
  vehicle: (id: string) => ["vehicle", id] as const,
  recognition: (vehicleId: string) => ["recognition", vehicleId] as const,
  // …
};
```

Mutations must invalidate the matching keys from this factory — never invent
parallel string arrays for the same resource.

## Error handling

```ts
try {
  await api.requestClearCodesAndDrive(vehicleId);
} catch (err) {
  if (err instanceof ApiError) {
    // err.statusCode, err.code, err.details
  }
}
```

The UI should not parse random string errors.

## Auth / headers (future)

When Auth lands, add tenant/auth headers **here** (constructor options), not in
pages. Garden's `@garden/api-client` is the pattern reference.

## Anti-patterns

Avoid:

- ad hoc `fetch` in React components
- untyped responses
- swallowed API errors
- duplicate / page-local query keys
- UI-specific transforms that drop semantic IDs, units, or quality fields
