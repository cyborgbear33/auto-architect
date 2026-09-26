# Backlog

Open improvement prospects. Shipped items are removed from here; the evidence report is the record.

The 2026-09-26 correctness pass shipped its one accepted item: [dossier lookup errors](evidence/dossier-lookup-errors-evidence.md).

## Security

### API is open to any browser and any network interface [apps/api]
Status: proposed
Problem: The diagnostic API has no login, reflects whatever origin a browser sends, and listens on every network interface by default. A page the operator has open, or another machine on the same network, can read the garage and post observations.
Evidence: `apps/api/src/app.ts` registers CORS with `origin: true`. `apps/api/src/config.ts` defaults `host` to `0.0.0.0`. `apps/api/src/server.ts` listens with that host. `apps/api/src/routes/index.ts` has no auth check on vehicle, observation, or repair routes. Unexpected errors are sent back as `e.message` from the handler in `app.ts`.
Expected value: A website or a neighbor on the LAN cannot read trouble codes or write evidence unless the operator opts in.
Effort: low
Risk: medium
Dependencies: none
Added: 2026-09-26 (kaizen-audit: Security)
