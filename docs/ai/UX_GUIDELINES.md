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
- Hick's Law — keep nav small and goal-grouped (six short groups in the rail; do not add a seventh destination without a new job)
- Fitts's Law — primary actions obvious; destructive actions separated
- Jakob's Law — familiar patterns for lists, forms, status, empty/error states
- Gestalt — group evidence with the claim it supports
- **Doherty Threshold** — keep live telemetry feeling responsive (perceived
  latency under ~400ms where practical; avoid full-panel loading flashes on poll)
- **Progressive disclosure** — operator-readable defaults; raw Mode 06 ids,
  ranking scores, and undecided classes behind the **Technical detail** toggle
  (debug mode)

Organize around: What codes are active? What fault class is proven? What should
I do next? Why? What is forbidden? What did I already try?

---

## 4. Information architecture (current)

Rail groups in `apps/web-ui/src/components/Layout.tsx` (labels stay short):

```text
Operate      — Dashboard (live condition)
Diagnose     — Diagnosis
Learn        — Discovery (capability forensics), Guide (mastery curriculum)
Procedures   — Functions (guided Proxi / special procedures; star a repeat procedure to pin it on Functions and the Dashboard)
Reference    — Problems (lookup; Diagnosis “Look up” prefills it), Recalls & TSBs (open from a dossier match, not an empty shortcut)
History      — Journal
```

Plus detail route: `/problems/$problemId` (opened from Diagnosis, not a rail item).

On narrow screens the rail is a menu; the selected vehicle name stays in the top bar.
Desktop keeps the labeled Vehicle control in the rail.

**Do not grow a flat destination list.** A new page belongs in an existing group, or it
is linked from Dashboard / Diagnosis instead of a new rail item.

**Guide** is the peace-of-mind manual: vehicle → ontology → discovery → scan →
troubleshoot, personalized per selected vehicle, with Markdown + Print/PDF
export. Link it from Discovery empty states and Dashboard — do not bury it.

### Keep the Mastery Guide current

The in-app **Guide** (`/guide`) is composed from
[`docs/VEHICLE_OBD_MASTERY_GUIDE.md`](../VEHICLE_OBD_MASTERY_GUIDE.md) plus
vehicle-specific blocks in `MasteryGuideService`. Treat it as operator-facing
product surface — not a one-time doc dump.

**Update the Guide in the same change** when any of these ship:

| Change type | Examples | What to update |
|---|---|---|
| Vehicle / profile | New vehicle, engine family, protocol hint, hardware notes (gray adapter, Proxi) | Template hardware/troubleshoot chapters if shared; confirm personalized blocks still read honestly for Jeep vs other profiles |
| Ontology meaning | New DTC/PID/Mode 06 dictionary rows that operators must understand; new concepts cartridges assert | Ontology chapter + any “what this app can mean” tables |
| Cartridges / recognition | New fault family, perception PIDs, framing that changes the diagnose path | Ontology + Operate console chapters; mention family coverage honestly |
| Scanning / discovery | New gateway modes, `discover` probes, CLI flags, default poll set, simulate flags | Discovery + Scan & watch + Troubleshooting + checklist |
| Console IA / workflow | New nav destinations, Functions/procedures, safety-hold behavior operators must know | Operate console + Troubleshooting + mastery checklist |
| Explicit non-goals | Something moved in/out of scope (e.g. Mode 0A, enhanced UDS) | “What mastery does *not* mean” |

**Do not** require a Guide edit for pure refactors, typo-only dictionary fills that
do not change operator workflow, or Debug-only internals.

**How:** edit `docs/VEHICLE_OBD_MASTERY_GUIDE.md` (shared curriculum + tokens),
adjust `MasteryGuideService` personalization blocks if vehicle-specific prose
changed, and extend `mastery-guide.test.ts` / Guide UI tests when behavior
branches (e.g. Jeep-only hardware). Cross-check Discoverability: Dashboard /
Discovery still link to **Guide**.

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
| Dashboard | One primary action (next step, open case, or how to scan) with the reason beside it. Guide, report, and refresh stay secondary. DTCs, proven classes, trends, and recommendations follow |
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
- [ ] If this PR changes operator workflow (profiles, ontology meaning, scan/discover
      capabilities, Functions, or nav), the Mastery Guide was refined (see §4
      “Keep the Mastery Guide current”)
- [ ] Tests cover the happy path + at least one policy/error path when relevant
