# DOCUMENTATION_DEV_GUIDE.md

How to create and maintain Markdown in `docs/` for auto-architect.

## Document types

| Type | Location | Audience | Style |
|---|---|---|---|
| AI coding / domain guides | `docs/ai/` | AI assistants, contributors | Concise, directive |
| Orientation / architecture / backlog | `docs/` | Contributors, operators | Thorough, cross-linked |
| Gateway operator notes | `apps/obd-gateway/README.md` | Operators | Step-by-step commands |

## Accuracy rules

1. **Never invent examples.** Verify paths, route names, class names, and CLI flags against source.
2. **Never copy aspirational comments** as if implemented.
3. **Prefer linking** to garden/metalanguage for shared theory; do not duplicate the full lesson here.
4. **Update docs with behavior changes** when practical (same PR/commit).
5. **For feature work, update `docs/FUTURE_FEATURES.md`** — Planned Backlog ↔ Implemented History.
6. **Keep the Mastery Guide honest.** When shipping major vehicle-profile, ontology,
   cartridge, gateway scan/discover, or operator-workflow changes, refine
   `docs/VEHICLE_OBD_MASTERY_GUIDE.md` and/or `MasteryGuideService` in the same
   change. Triggers and scope: [`UX_GUIDELINES.md`](UX_GUIDELINES.md) §4
   “Keep the Mastery Guide current”.

## Layered guidance model

Keep three layers distinct:

1. **Fundamental** — propose/dispose, ontology-owns-meaning, ActionService gate, lesson pointer (`LESSON_AGENT_DETERMINISTIC_APPS.md`)
2. **Product (auto)** — AI coding rules, code standards, UX/UI/API/ontology guides with automotive vocabulary
3. **OBD/CANBUS** — `OBD_EDGE_CONTRACT.md`, `HARDWARE_STANDARDS.md`, and gateway README

Do not mix OEM wiring tips into the fundamental lesson pointer.

## Structure

- `##` / `###` headings; avoid deep `####` trees
- Prefer bold-lead paragraphs over stub subsections
- Use tables for inventories (routes, services, cartridges)
- Keep commands copy-pasteable from repo root unless noted

## Required entry points (do not delete)

- `docs/AI_HANDOFF.md`
- `docs/WALKTHROUGH.md` (narrative theory / features / technology)
- `docs/ARCHITECTURE.md`
- `docs/FUTURE_FEATURES.md`
- `docs/ai/README_FOR_AI.md`
- `docs/LESSON_AGENT_DETERMINISTIC_APPS.md` (pointer)

When adding a major guide, link it from `AI_HANDOFF.md` §7 and from
`ai/README_FOR_AI.md` read order.
