# Audit log

Append-only — one row per kaizen-audit run. Never edit a prior row.

| Date | Dimension | Scope | Method | Found | Accepted | Rejected (reasons) | Next dimension due |
|---|---|---|---|---|---|---|---|
| 2026-09-26 | Correctness / Functionality | apps/web-ui | Read of the Diagnosis dossier and the recommendation query keys | 2 | 1 ([dossier lookup errors](evidence/dossier-lookup-errors-evidence.md)) | 1 (recommendation list and the next-action card both request open recommendations on the same query key, so they do not disagree) | Security |
| 2026-09-26 | Security | whole repo | `pnpm audit` plus a read of API listen, CORS, route auth, shell spawn, and SQL construction | 6 | 1 ([API is open to any browser and any network interface](../BACKLOG.md)) | 5 (drizzle identifier injection: store uses `eq`/`and` only, no `sql.identifier`; find-my-way HTTP/2 crash: `server.ts` does not enable HTTP/2; vitest UI file read: tests use `vitest run`, not the UI server; fast-uri SSRF: API has no outbound fetch of request URLs; browserslist/nanoid/vite-via-vitest: build and test tools, not a request path) | Performance |
| 2026-09-26 | Performance | apps/api observation store | Timed `createMemoryStore` inserts at 500 / 2,000 / 8,000 batches, plus seven `series` walks and a 50-run problem-catalog mean | 3 | 1 ([memory log re-sort](../BACKLOG.md)) | 2 (forecast walks the log once per signal: 3.1 ms at 8,000 batches, not worth a change; problem catalog rebuild averages 0.32 ms) | Reliability / Stability |
| 2026-09-26 | Reliability / Stability | apps/api store writes | Read of observation retention, discovery history, recognition error handling, and the web query client | 3 | 1 ([retention rewrite](../BACKLOG.md)) | 2 (in-memory loss on process exit is the memory driver, not a failed write; query `retry: 1` applies to reads, and mutations are not retried) | Maintainability / Code Quality |
