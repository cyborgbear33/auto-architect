# UI_DEV_GUIDE.md

Technical / architectural rules for `apps/web-ui`. For design/usability rules,
see [`UX_GUIDELINES.md`](UX_GUIDELINES.md).

## Stack

- React 19 + Vite 6
- TanStack Router (file-ish route modules under `src/routes/`)
- TanStack Query for server state
- Redux Toolkit for durable client-only UI state (`selectedVehicleId`, `debugMode`)
- Tailwind CSS v4 (`@tailwindcss/vite`)
- Vitest + Testing Library + jsdom

There is **no** `@auto/ui-components` or `@auto/api-client` package yet. Keep the
local `src/lib/api.ts` thin and typed against `@auto/semantic-types`. When those
packages are added (see `FUTURE_FEATURES.md`), migrate rather than inventing a
third client.

## State ownership

| Kind of state | Owner |
|---|---|
| Vehicles, DTCs, recognition, problems, campaigns, decisions | TanStack Query |
| Selected vehicle id, debug mode | Redux (`uiSlice`) + localStorage persistence |
| Ephemeral form fields | Local React state |

Do not put server lists in Redux. Do not put selected vehicle only in a
component `useState` without persistence (unless intentionally ephemeral).

## Routing

Defined in `src/router.tsx`. Root layout is `components/Layout.tsx` (sidebar +
vehicle switcher + debug toggle).

When adding a route:

1. Create `src/routes/<Name>.tsx`
2. Register in `router.tsx`
3. Add a nav item only if it is a top-level goal (prefer linking from Dashboard /
   Diagnosis instead of growing nav)
4. Add a focused RTL test when the page has meaningful interaction

## API client rules

`src/lib/api.ts`:

- Use `fetch` with structured `ApiError`
- Send `Content-Type: application/json` **only when there is a body** — Fastify
  rejects empty-body requests that claim JSON
- Encode path segments (`encodeURIComponent`) for semantic ids
- Do not catch-and-swallow policy errors; let the page render the message

## Data loading patterns

```tsx
const vehicleId = useAppSelector((s) => s.ui.selectedVehicleId);
const q = useQuery({
  queryKey: ["recognition", vehicleId],
  queryFn: () => api.getRecognition(vehicleId),
  enabled: Boolean(vehicleId),
});
```

- Key by resource + `vehicleId`
- Gate with `enabled` when no vehicle selected
- Invalidate related queries after mutations (create problem, solve, log repair)

## Testing

- Mock `../lib/api` (or `../../lib/api`) with `vi.mock`
- Hoist error classes with `vi.hoisted` when needed
- Scope ambiguous text with `within(section)`
- Prefer `findBy*` for async-loaded content

## Do not

- Classify DTCs or invent fault classes in the UI
- Bypass ActionService endpoints with ad-hoc store writes (there is no client store for domain facts)
- Add Next.js, GraphQL, or a second router
- Copy garden pages wholesale without adapting IA to the 4-item auto nav
