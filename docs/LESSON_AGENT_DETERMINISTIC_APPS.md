# Lesson pointer — Agent + Deterministic Ontology Apps

The complete, self-contained lesson guide lives with the LOGOS kernel
(theory + runnable workshop + garden-architect as the reference practice, with
TBox/ABox, cartridges, and every primitive explained in applied detail):

**→ [`../../metalanguage/docs/LESSON_AGENT_DETERMINISTIC_APPS.md`](../../metalanguage/docs/LESSON_AGENT_DETERMINISTIC_APPS.md)**

If your checkout layout differs, open that path under `metalanguage/docs/`
next to this monorepo.

Workshop (realize → reason) after installing LOGOS:

```bash
pip install -e /path/to/metalanguage/engine[dev,schema]
python3 /path/to/metalanguage/examples/lesson-workshop/thirsty_loop.py
```

Then return here for the automotive domain swap:

| Guide | Use |
|---|---|
| [`WALKTHROUGH.md`](WALKTHROUGH.md) | Auto-architect narrative: theory + features + tech |
| [`AI_HANDOFF.md`](AI_HANDOFF.md) | Cross-repo orientation for auto-architect |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | As-built service graph |
| [`ai/ADD_A_CARTRIDGE.md`](ai/ADD_A_CARTRIDGE.md) | Extend a diagnostic domain without brain surgery |
| [`ai/ADD_A_VEHICLE.md`](ai/ADD_A_VEHICLE.md) | Add the next vehicle / engine family |
| [`ai/OBD_EDGE_CONTRACT.md`](ai/OBD_EDGE_CONTRACT.md) | OBD-II / CANBUS edge rules |
| [`FUTURE_FEATURES.md`](FUTURE_FEATURES.md) | What to build next |

**Domain-swap cheat sheet (garden → auto):**

| Garden | Auto |
|---|---|
| Garden / bed | Vehicle / engine system |
| Sensor observation | PID / DTC / freeze-frame / Mode 06 |
| Plant-health cartridge | Misfire / lean / MultiAir cartridge |
| `hasEnv` / `hasSymptom` | `hasDtc` / `hasCondition` / `hasTrend` |
| MQTT edge-gateway | Python `obd-gateway` |
| Garden switcher | Vehicle switcher |
