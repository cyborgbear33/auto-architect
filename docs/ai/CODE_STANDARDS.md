# CODE_STANDARDS.md

Minimal, enforceable code quality for auto-architect. Stack and layer rules live
in [`GLOBAL_DEV_GUIDE.md`](GLOBAL_DEV_GUIDE.md); this doc is the day-to-day
Definition of Done for TypeScript/React/Fastify work.

---

## 1. Definition of Done

Before finishing meaningful work:

```bash
pnpm healthcheck
```

That one command runs typecheck, Biome, unit tests, ontology lint (advisory if
LOGOS missing), obd-gateway tests (skipped with warning if `.venv` missing), and
a web-ui production build. Use `pnpm healthcheck --fast` to skip gateway tests
and the UI build during quick iteration.

CI enforces the same gates (plus a hard ontology-lint job).

---

## 2. TypeScript

Base config: [`tsconfig.base.json`](../../tsconfig.base.json).

Required flags (do not weaken without an explicit ADR):

- `strict`
- `noUncheckedIndexedAccess`
- `noImplicitOverride`
- `noFallthroughCasesInSwitch`
- `noUnusedLocals` / `noUnusedParameters` / `noImplicitReturns`

Conventions already in use:

- ESM (`"type": "module"`)
- Explicit `.ts` / `.tsx` import extensions where the package uses them
- camelCase in-app; snake_case only inside `@auto/logos-bridge`
- Prefer shared types from `@auto/semantic-types` over ad-hoc DTOs

Prefix intentionally unused parameters with `_` (TypeScript exempts them).

---

## 3. Biome (format + lint)

Tooling: `@biomejs/biome` at the repo root. Config: [`biome.json`](../../biome.json).

```bash
pnpm lint          # biome check (CI)
pnpm lint:fix     # apply safe fixes
pnpm format        # format only
```

Style baseline:

- 2-space indent
- double quotes
- recommended linter rules

Do not add ESLint or Prettier alongside Biome. Python edge lint is backlog
(Ruff — see `FUTURE_FEATURES.md`).

---

## 4. Errors and mutations

- External input → Zod schemas in `@auto/validation`
- Domain mutations → `ActionService` only
- API errors → `AppError` / `lib/bridge-errors.ts` (stable, UI-readable)
- Do not swallow policy failures in the UI fetch client

---

## 5. React / UI

- TanStack Query for server state; Redux only for durable client UI
  (`selectedVehicleId`, `debugMode`)
- Live refetch: prefer `placeholderData: keepPreviousData` so gauges do not
  flash empty on every poll (see `UI_DEV_GUIDE.md`)
- No client-side fault classification

---

## 6. Testing

See [`TESTING_DEV_GUIDE.md`](TESTING_DEV_GUIDE.md). Prefer `FakeLogosBridge` for
API unit tests; never require hardware for gateway tests.
