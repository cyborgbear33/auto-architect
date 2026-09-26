# API listens on localhost

Problem
The diagnostic API had no login, reflected any browser origin, and listened on every network interface by default.

Evidence
`apps/api/src/app.ts` registered CORS with `origin: true`. `apps/api/src/config.ts` defaulted `host` to `0.0.0.0`. Unexpected errors were returned as `e.message`.

Current Behavior
The API binds `127.0.0.1` unless `HOST` is set. CORS allows the local Vite console origins unless `CORS_ORIGINS` is set. A 500 response says "Unexpected error." The server log still prints the real message.

Desired Outcome
A website or a neighbor on the LAN cannot read trouble codes or write evidence unless the operator opts in.

Options Considered
Add a login token now. Deferred: the API guide still treats auth as later work, and the console reaches the API through the Vite proxy on the same machine.

Recommended Change
Default the bind address to localhost, allow only the local console origins, and stop returning unexpected exception text to the client.

Architecture/Ontology Impact
None.

UX Impact
The console is unchanged when it uses the Vite proxy. A browser page on another origin cannot read the API. Set `HOST=0.0.0.0` to listen on the LAN.

Security/Privacy Impact
Cross-origin browser reads and LAN access are off by default. The port is still unauthenticated for any local process that can connect.

Migration Impact
Anything that reached the API from another machine must set `HOST`. Anything that called it from a browser origin other than the local Vite console must set `CORS_ORIGINS`.

Test Plan
`config.test.ts` checks the defaults and the opt-in variables. `app.smoke.test.ts` checks that an unknown origin is not reflected, that `http://localhost:5173` is, and that a thrown error is not copied into the response.

Success Metrics
Those tests pass.

Rollback Plan
Restore `host` default `0.0.0.0` and `origin: true`.

Completed 2026-09-26: bind, CORS allowlist, and generic 500 text shipped. Verified by `pnpm --filter @auto/api exec vitest run src/config.test.ts src/app.smoke.test.ts` (9 passed).

Issues Encountered
none

Deviations from the Plan
none

Known Gaps
There is still no login. `HOST=0.0.0.0` opens the port to the LAN without a password. Client errors below 500 can still include the Fastify message.
