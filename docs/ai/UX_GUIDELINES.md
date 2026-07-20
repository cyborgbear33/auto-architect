# UX_GUIDELINES.md

*auto-architect's UX standard — same fundamental guidance as garden-architect's
UX guide, adapted for an OBD/CANBUS diagnostic console.*

> **Companion to [`UI_DEV_GUIDE.md`](./UI_DEV_GUIDE.md).** That doc covers stack,
> routing, and data-flow. This doc covers information architecture, trust,
> evidence, and content. Read both before touching a page.

---

## 1. Purpose

auto-architect is an operational interface between a vehicle, OBD-II evidence,
human judgment, formal reasoning, recommendations, and repair history. The UI must:

1. Help the user understand the vehicle's present diagnostic condition.
2. Help the user decide what to test or repair next.
3. Help the user respect safety holds (not soft suggestions).
4. Help the user trust the system through evidence, transparency, and records.

> Design around user intent, vehicle state, risk, and next action — not around
> which backend service happens to expose a route.

---

## 2. Product Identity

auto-architect should feel like a serious diagnostic console for a real vehicle,
not a generic admin dashboard and not a theorem-prover demo. Keep LOGOS / DL /
ontology internals backstage unless Debug mode is on. The user should feel like
they're diagnosing a car with a competent assistant, not auditing a reasoner.

---

## 3. Shared foundations (keep these)

Apply the same universal rules garden uses:

- Nielsen heuristics (status visibility, real-world language, error prevention)
- Norman principles (affordance, feedback, conceptual model)
- Hick's Law — keep nav small and goal-grouped (auto currently has 4 top-level items; keep it that way)
- Fitts's Law — primary actions obvious; destructive actions separated
- Jakob's Law — familiar patterns for lists, forms, status, empty/error states
- Gestalt — group evidence with the claim it supports
- **Doherty Threshold** — keep live telemetry feeling responsive (perceived
  latency under ~400ms where practical; avoid full-panel loading flashes on poll)
- **Progressive disclosure** — operator-readable defaults; raw Mode 06 / DL ids /
  proof internals behind Debug mode (already practiced — name it when extending)

Organize around: What codes are active? What fault class is proven? What should
I do next? Why? What is forbidden? What did I already try?

---

## 4. Information architecture (current)

Real nav (`apps/web-ui/src/components/Layout.tsx`):

```text
Dashboard · Diagnosis · Discovery · Guide · Functions · Recalls & TSBs · Journal
```

Plus detail route: `/problems/$problemId`.

**Do not grow a flat 17-item nav.** Goal grouping (keep labels short in the rail):

```text
Operate     — Dashboard (live condition)
Diagnose    — Diagnosis, Problem detail
Verify/Learn — Discovery (capability forensics), Guide (mastery curriculum)
OEM ops     — Functions (guided Proxi / special procedures)
Reference   — Recalls & TSBs
History     — Journal
```

**Guide** is the peace-of-mind manual: vehicle → ontology → discovery → scan →
troubleshoot, personalized per selected vehicle, with Markdown + Print/PDF
export. Link it from Discovery empty states and Dashboard — do not bury it.

Vehicle switcher is global (every page). Same pattern as garden's garden switcher.

---

## 5. OBD / CANBUS-specific UX layer

These rules are domain-specific and take precedence over generic dashboard habits:

1. **Evidence before conclusion.** Show DTC + supporting PIDs / freeze-frame near
   any proven fault class. Never show only a class name.
2. **Proven ≠ possible.** Undecided recognition must not look like a clean bill of
   health. Prefer empty/"insufficient evidence" over a green "Healthy" badge.
3. **Safety holds are hard stops.** When policy forbids clear-codes-and-drive (or
   similar), show the business reason, not a raw HTTP/JSON parse error.
4. **Ranked next steps are the product.** After a solve, lead with ordered actions
   (impact / cost / risk / confidence), not ontology jargon.
5. **Campaigns are grounding, not ads.** Recall/TSB matches should cite campaign id
   and why the vehicle matched (engine family, mileage band when available).
6. **Journal is the trust layer.** Logging a repair should be easy and visible in
   history; outcomes feed future confidence.
7. **Simulate vs live must be obvious** when operators use `--simulate` data — do
   not let lab fixtures look like a live drive without context (Debug mode / source
   labels when available).
8. **Units matter.** PIDs without units are noise (%, °C, kPa, RPM).

---

## 6. Live / adaptive data UX

Forward guidance for Live gauge view, Mode 06 UI, and freeze-frame panels
(planned in `FUTURE_FEATURES.md`). These rules apply whenever the UI shows
streaming or polled OBD evidence:

1. **Staleness is first-class.** Show age-of-reading (or "stale / disconnected"),
   not only the numeric value. A quiet gauge with old data is worse than an
   empty state that says the adapter stopped.
2. **Adapt to the vehicle.** Gauges and PID rows should reflect what the selected
   vehicle's engine-family cartridges actually perceive — not a wall of every
   J1979 PID. `MANUAL_ONLY_PIDS` get a distinct "manual entry" treatment vs live.
3. **Thresholds come from perception, not decoration.** Out-of-range coloring must
   track real cartridge / diagnostic thresholds. Never rely on color alone —
   pair with a label or icon.
4. **Prefer instrument-cluster familiarity.** Arcs/bars/numeric readouts over
   novel dashboard widgets (Jakob's Law).
5. **Operator vs Debug layering for Mode 06.** Pass/fail (and plain names) for
   operators; raw TID/CID / min-max values behind Debug mode — same pattern as
   recognition class ids on the Dashboard.
6. **Adapter identity near the live panel.** Connection / simulate / live source
   should be visible next to the telemetry itself, not only as a global banner
   (extends §5 rule 7).
7. **Smooth refetch.** Live polls must not flash the whole section empty — see
   `placeholderData: keepPreviousData` in [`UI_DEV_GUIDE.md`](UI_DEV_GUIDE.md).

---

## 7. Page jobs (one job each)

| Page | One job |
|---|---|
| Dashboard | Present condition: DTCs, proven classes, oil trend, top recommendations |
| Diagnosis | Draft/solve problems from proven classes; demonstrate safety holds |
| Problem detail | Show solution + ranked actions; log repair outcome |
| Campaigns | Match recalls/TSBs for the selected vehicle |
| Journal | Audit trail of decisions |

Do not turn Dashboard into a second Diagnosis page.

---

## 8. Recommendations & explainability

A recommendation should answer:

- What should I do?
- Why (evidence / proven class)?
- How confident?
- What are the risks / costs?
- What happens if I ignore it?

Prefer fields already on `@auto/semantic-types` `Recommendation` /
`DecisionRecord` over inventing parallel UI-only shapes.

---

## 9. States

Every data-backed section needs intentional:

- loading
- empty (no DTCs / no proven classes / no campaigns)
- error (API / policy block — show human message)
- partial (some PIDs missing)

Never leave a blank white panel with no explanation.

---

## 10. Content / writing

- Prefer shop language: "Cylinder 4 misfire under load", not `MisfireUnderLoad`
  as the only label (show the id in Debug mode).
- Prefer "Safety hold: clearing codes is blocked while a misfire is proven" over
  `POLICY_FORBIDDEN`.
- Keep OEM / TSB identifiers exact when citing campaigns (`W80`, `W84`,
  `TSB 05047457A`).

---

## 11. Review checklist (before merging UI)

- [ ] Page has one primary job
- [ ] Selected vehicle is obvious
- [ ] Evidence is adjacent to claims
- [ ] No fake "Healthy" when undecided
- [ ] Policy blocks show operator-readable reasons
- [ ] Empty / loading / error states exist
- [ ] Live / polled sections show staleness and avoid loading flashes
- [ ] Debug mode does not become the only way to use the page
- [ ] Tests cover the happy path + at least one policy/error path when relevant
