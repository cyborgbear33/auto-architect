# Vehicle & OBD-II mastery guide

_Peace-of-mind curriculum for auto-architect: know your vehicle, understand its
ontology, verify capabilities with Discovery, gather evidence, diagnose safely,
and troubleshoot connection issues — without confusing standard OBD-II with
dealer/OEM tools._

> **In-app:** select a vehicle → **Guide**. That page personalizes this curriculum
> for the selected profile and offers Markdown download + printer-friendly Print.
> This file is the shared source text the API fills with vehicle-specific blocks.
>
> **Maintainers:** when you ship major vehicle-profile, ontology, cartridge,
> scan/discover, or operator-workflow changes, refine this file (and
> `MasteryGuideService` personalization if needed) in the same change. Triggers:
> [`ai/UX_GUIDELINES.md`](ai/UX_GUIDELINES.md) §4 “Keep the Mastery Guide current”.

---

## How to use this guide

Work the chapters in order the first time. After that, jump by need:

1. **Know your vehicle** — correct profile, hardware, protocol expectations
2. **Ontology** — what meaning the app can honestly attach to bus data
3. **Discovery** — verify what this ECU + MX+ can expose (support, not values)
4. **Scan & watch** — gather evidence into Dashboard / Diagnosis
5. **Operate the console** — read badges, gauges, recommendations, Journal
6. **Special procedures** — Proxi / Functions when standard OBD is not enough
7. **Troubleshooting** — when the pipe fails or conclusions feel wrong
8. **Mastery checklist** — peace-of-mind gate before trusting a case

Empty honest data is never “healthy.” It means nothing was measured yet.

---

{{PERSONALIZED_FRONT}}

---

## 1. Know your vehicle

Before any scan, confirm the UI vehicle switcher and the gateway `--vehicle-id`
name the **same** profile. Wrong id → wrong engine-family cartridges → wrong
recognition.

### What a vehicle profile is

A profile is not a VIN decoder dump. It is the app’s contract for:

- Make / model / year / trim (human identity)
- `engineFamily` (which cartridges and ontology view apply)
- Optional `obdProtocol` hint (never force blindly on live sessions)
- Notes (hardware quirks, campaigns, Proxi pointers)

Profiles live in `packages/ontology/vehicle-profiles.json` and are seeded into
the API garage.

### Hardware mental model

```text
Vehicle DLC  →  (optional access adapter)  →  OBDLink MX+  →  host  →  obd-gateway  →  API  →  UI
```

- **OBDLink MX+** is the preferred Bluetooth ELM327-class interface.
- Access adapters (e.g. Jeep gray) are **physical** helpers. They do not unlock
  OEM/UDS modules by themselves.
- Ignition ON (engine running preferred for many PIDs and monitors).

### Protocol discipline

- Prefer **auto-detect** unless you have proven a forced protocol for that truck.
- Jeep Renegade (ISO 15765-4 CAN) vs older GMT800 trucks (often J1850 VPW) are
  different — forcing CAN on the wrong bus wastes an afternoon.

{{HARDWARE_BLOCK}}

---

## 2. Ontology — what the app can mean

Ontology here is curated meaning, not “the car told us everything.”

| Layer | Role |
|---|---|
| DTC dictionary | Human text + fault **concepts** for codes we seed |
| PID dictionary | Units, Mode 01 hex, manual-only flags |
| Mode 06 dictionary | OBDMID labels / concepts (never invent TID charts) |
| Cartridges | Perception + framing rules for an engine family |
| Campaigns / TSBs | Curated recalls & bulletins (not read from the bus) |
| Special procedures | Guided OEM ops (e.g. Proxi) executed **outside** the gateway |

### Engine family → cartridges

Recognition loads cartridges for **this vehicle’s** `engineFamily`. SAE-generic
families (misfire, lean, EVAP, …) may apply broadly; OEM depth (MultiAir oil
path, GM stub) is family-specific and must stay honest.

{{ONTOLOGY_BLOCK}}

### What ontology does *not* do

- Invent a “Healthy” class from silence
- Claim dealer-complete coverage from Mode 01–07 alone
- Replace AlfaOBD / wiTECH for module configuration sync

---

## 3. Discovery — verify capabilities first

Discovery answers: **Given this vehicle, MX+, adapter notes, and connection
state, what standard OBD-II information is available to scan, and how does each
item map into our ontology?**

It is a **support probe**, not a PID value dump.

### Why this is the peace-of-mind step

- Separates “we can ask” from “we measured a value”
- Surfaces unmapped ECU keys (supported but missing from dictionary)
- Labels cartridge-relevant PIDs so you know what recognition can use
- Records protocol / port / source (live vs simulated)

### How to run it

Lab (no hardware) — catalog of what the gateway knows how to ask:

```bash
cd apps/obd-gateway
python -m obd_gateway --vehicle-id {{CLI_VEHICLE_ID}} --simulate --dry-run discover
```

Live probe + POST to the API (omit `--dry-run` to ingest):

```bash
python -m obd_gateway --vehicle-id {{CLI_VEHICLE_ID}} discover
```

Then open **Discovery** in the UI.

{{DISCOVERY_BLOCK}}

### After Discovery

1. Note Mode 01 supported vs unsupported vs unknown
2. Check Mode 06 MID coverage and freeze-frame / VIN flags
3. Read hardware notes (gray adapter is context, not a protocol unlock)
4. Only then run `scan` / `watch` for values

---

## 4. Scan & watch — gather evidence

| Command | Use when |
|---|---|
| `scan` | Shop stop — one-shot DTCs, default PIDs, FF, Mode 06 |
| `watch` | Drive logging — periodic PID batches into a DriveSession |
| `--simulate` | Lab / CI / UI demos without hardware |
| `--manual-pid` | Operator-entered values (e.g. Jeep oil pressure/level) |

Always use the **same** `--vehicle-id` as the UI selection.

```bash
python -m obd_gateway --vehicle-id {{CLI_VEHICLE_ID}} scan
python -m obd_gateway --vehicle-id {{CLI_VEHICLE_ID}} watch --interval 5
```

Gateway posts `Observation` batches. It never classifies faults itself.

### Evidence trust

- Dashboard **source badge**: live OBD vs simulated vs manual vs imported
- Stale gauges mean the watch stopped — do not diagnose “now” from old numbers
- Freeze frame / Mode 06 may be empty this cycle — that is honest, not healthy

---

## 5. Operate the console

### Dashboard (Operate)

Live condition: DTCs, gauges, freeze frame, Mode 06, recognition narration,
recommendations, drive sessions.

### Diagnosis

Cases, policy safety holds, solve/draft, verify-after-repair, case timeline.

### Discovery

Capability forensics (this guide’s verification chapter).

### Functions

Guided special procedures (Proxi, etc.). Execution is typically an external
enhanced tool + MX+ — the app tracks the checklist and Journal trail.

### Recalls & TSBs

Curated campaigns for the engine family — check before concluding “mystery.”

### Journal

Decisions, exports, audit trail.

{{PROCEDURES_BLOCK}}

---

## 6. Troubleshooting

### Connection & adapter

- Ignition on; reseat DLC / gray adapter / MX+
- Re-bind Bluetooth rfcomm; set `AUTO_OBD_PORT` once stable
- Prefer `--verbose` on the gateway when pairing fails
- Clear forced `AUTO_OBD_PROTOCOL` on trucks that need auto-detect

### Empty or odd data

- Engine running for many PIDs / monitors
- Confirm Discovery supported list before widening `--pids`
- Wrong `--vehicle-id` → wrong cartridges (fix first)
- Simulated batches mistaken for live — check the source badge

### Recognition feels wrong

- No DTCs + no PIDs ≠ Healthy
- Mode 06 / FF absent this cycle is not a monitor pass
- Jeep stuck in Park / flashing odo after battery → **Functions → Proxi**, not
  another Mode 03 scan alone

### Safety

- Clearing codes is an API/policy action, never an edge privilege
- Do not add “clear and hope” shortcuts to the gateway

{{TROUBLESHOOTING_BLOCK}}

---

## 7. Mastery checklist (peace of mind)

Before trusting a diagnosis session:

1. Correct vehicle selected in UI **and** gateway `--vehicle-id`
2. Hardware seated; ignition on; protocol not blindly forced
3. **Discovery** run (live preferred; simulate OK for learning the catalog)
4. At least one successful evidence batch with an honest source badge
5. DTCs reviewed with dictionary text when present
6. Freeze frame / Mode 06 noted present **or** honestly absent
7. Live gauges fresh if diagnosing “right now”
8. Campaigns / Functions checked when symptoms match (W80/W84, Proxi, …)
9. Report or Guide exported if you need a paper/PDF trail (Print → Save as PDF)

---

## 8. What mastery does *not* mean

- Replacing a dealer tool for module programming
- Claiming full SAE J1979/J2012 coverage from our seed dictionaries
- Bi-directional actuator control or flashing from this app
- Treating Discovery support bits as live sensor values

Standard OBD-II + curated ontology is the supported path. Enhanced OEM sessions
stay explicit, guided, and usually external.

---

_Generated for auto-architect · {{GENERATED_AT}}_
_
Companion ops notes: `docs/OPERATOR_OBD_MANUAL.md` · Edge rules: `docs/ai/OBD_EDGE_CONTRACT.md` ·
Standards: `docs/ai/HARDWARE_STANDARDS.md`._
