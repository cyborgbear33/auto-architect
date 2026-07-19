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

`@auto/api-client` owns fetch, `ApiError`, and `queryKeys`. `src/lib/api.ts` is
a thin Vite-configured singleton — import from there (or the package) and do
not invent a second client. Shared presentational pieces still live locally
until `@auto/ui-components` lands (see `FUTURE_FEATURES.md`).

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

See [`API_CLIENT_DEV_GUIDE.md`](API_CLIENT_DEV_GUIDE.md). In the UI:

- Import `api`, `ApiError`, `queryKeys` from `src/lib/api.ts`
- Do not catch-and-swallow policy errors; let the page render the message

## Data loading patterns

```tsx
const vehicleId = useAppSelector((s) => s.ui.selectedVehicleId);
const q = useQuery({
  queryKey: queryKeys.recognition(vehicleId),
  queryFn: () => api.getRecognition(vehicleId),
  enabled: Boolean(vehicleId),
});
```

- Use `queryKeys.*` — never invent parallel string keys
- Gate with `enabled` when no vehicle selected
- Invalidate related queries after mutations (create problem, solve, log repair)
- For live / polled PIDs (gauges, watch-mode dashboards), use
  `placeholderData: keepPreviousData` (TanStack Query v5) so refetch does not
  flash empty loading states — see `UX_GUIDELINES.md` §6

## Testing

- Mock `../lib/api` with `vi.mock` + `importOriginal` so `queryKeys` stays real
- Hoist error classes with `vi.hoisted` when needed
- Scope ambiguous text with `within(section)`
- Prefer `findBy*` for async-loaded content

## Do not

- Classify DTCs or invent fault classes in the UI
- Bypass ActionService endpoints with ad-hoc store writes (there is no client store for domain facts)
- Add Next.js, GraphQL, or a second router
- Copy garden pages wholesale without adapting IA to the 4-item auto nav
