# Operator OBD manual — OBDLink MX+ integration plan

Human-readable guide for connecting vehicles to **auto-architect** through an
**OBDLink MX+** (ELM327-compatible) and growing toward the most useful, thorough
standard-OBD picture we can get without proprietary shop-tool sessions.

**Start here in the app:** select a vehicle → **Guide** (vehicle-personalized
mastery curriculum with Markdown download and Print → Save as PDF). Shared
source text: [`VEHICLE_OBD_MASTERY_GUIDE.md`](VEHICLE_OBD_MASTERY_GUIDE.md).

Companion technical docs (for agents / implementers):

- [`ai/OBD_EDGE_CONTRACT.md`](ai/OBD_EDGE_CONTRACT.md) — what the gateway may do
- [`ai/HARDWARE_STANDARDS.md`](ai/HARDWARE_STANDARDS.md) — SAE/ISO grounding
- [`../apps/obd-gateway/README.md`](../apps/obd-gateway/README.md) — CLI install
- [`FUTURE_FEATURES.md`](FUTURE_FEATURES.md) — backlog (S1 live dry-run, etc.)

---

## 1. What this app is trying to do

Auto-architect does **not** replace AlfaOBD or a dealer scan tool. It:

1. **Reads** standard OBD-II evidence from the vehicle (via OBDLink MX+)
2. **Stores** that evidence against a vehicle profile
3. **Proves** fault classes with LOGOS (never invents “Healthy”)
4. **Surfaces** narration, evidence, recommendations, and reports for an operator

The long-term goal of *this* manual is a clear path to **optimal use of the
MX+ on the legislated OBD-II interface**: the richest honest map of modes, PIDs,
monitors, freeze frames, and readiness that the adapter + ECU expose — tied to
curated meaning (dictionaries, cartridges, campaigns).

---

## 2. Reference hardware (this garage)

| Item | Spec / note |
|---|---|
| Primary adapter | **OBDLink MX+** (Bluetooth ELM327-class; preferred) |
| Host path | Linux Bluetooth → `/dev/rfcomm*` or USB serial → gateway CLI |
| Software edge | `apps/obd-gateway` (`scan` / `watch`) → `POST …/observations` |

### 2015 Jeep Renegade Latitude 2.4L — access adapter

On the Jeep, the OBDLink MX+ is used with a **gray-type OBD-II adapter /
extension** between the vehicle DLC and the MX+. Purpose: **better physical
access** to the port (reach / clearance), not a protocol change.

- Treat it as part of the Jeep’s reference setup when pairing or documenting S1.
- It does **not** unlock OEM-enhanced / UDS sessions by itself.
- If Bluetooth range or connection flakiness appears, reseat the gray adapter
  and MX+, confirm ignition-on, then retry auto-detect (do not force protocol).

Profile id: `veh:jeep-renegade-2015-latitude`  
Protocol note: ISO 15765-4 (CAN, 500 kbps).

### 2003 Chevrolet Silverado 2500 HD (gas 6.0L)

Profile id: `veh:silverado-2500hd-2003`  
Leave protocol **auto-detect** (GMT800 gas is often J1850 VPW — do not hard-force
CAN). Same MX+ family; no Jeep-specific gray adapter required unless you choose
one for access.

---

## 3. What a “full picture” means here

| Layer | Useful for | Status today |
|---|---|---|
| Mode 01 live PIDs | Load, trims, temps, O2 voltages, … | Gateway polls a seed set; expandable |
| Mode 02 freeze frame | Conditions when a DTC set | Gateway populates when ECU has a frame |
| Mode 03 / 07 DTCs | Stored / pending codes + dictionary text | Primary path |
| Mode 06 monitors | Catalyst / O2 / EVAP / EGR / … pass-fail | SAE-seed OBDMIDs when ECU supports |
| Mode 0A permanent DTCs | Survived clear | Schema-aware; not yet in python-OBD path |
| Drive / watch sessions | Trends over a trip | `watch` + DriveSession when used |
| Manual PIDs | Oil pressure/level (Jeep MultiAir path) | `--manual-pid` only |
| Campaigns / TSBs | Known Jeep W80/W84 / TSB cards | Curated JSON, not from the bus |
| OEM enhanced / UDS | Module dumps, bi-directional | **Out of scope** (see non-goals) |

Empty honest scan ≠ healthy. It means nothing was measured or reported.

---

## 4. Operator workflow (do this every time)

1. **Start the API** (`pnpm dev:api` or Postgres variant if you want durable history).
2. **Open the UI** and select the correct vehicle (Jeep vs Silverado).
3. **Hardware**
   - Jeep: plug gray adapter into the DLC, then MX+ into the gray adapter.
   - Silverado: MX+ into DLC (or your chosen extension).
   - Ignition ON (engine running preferred for many PIDs / monitors).
4. **Pair / bind** Bluetooth if needed (see gateway README). Prefer
   `AUTO_OBD_PORT=/dev/rfcomm0` once bound.
5. **Leave `AUTO_OBD_PROTOCOL` unset** unless you have proven a forced id.
6. **Scan** with the **same** `--vehicle-id` as the UI:

   ```bash
   cd apps/obd-gateway
   python -m obd_gateway --vehicle-id veh:jeep-renegade-2015-latitude scan
   # or during a drive:
   python -m obd_gateway --vehicle-id veh:jeep-renegade-2015-latitude watch --interval 5
   ```

7. **Refresh Dashboard / Diagnosis** — recognition, gauges, FF/Mode 06 panels,
   recommendations.
8. Optional Jeep oil path: `--manual-pid OIL_PRESSURE_PSI=…` /
   `OIL_LEVEL_PCT=…` when the ECU does not expose those as Mode 01.

Lab without hardware:

```bash
python -m obd_gateway --vehicle-id veh:jeep-renegade-2015-latitude \
  --simulate --dry-run \
  --simulate-dtc P0304:stored \
  --simulate-freeze-frame P0304 \
  --manual-pid ENGINE_LOAD=85:% \
  --simulate-mode06 21:01:0.8:0:0.5:fail \
  scan
```

### Capability discovery (vehicle intelligence)

Before or after a scan, probe **what the ECU can expose** (support bits, not a
full PID value dump). The API enriches the report with ontology / cartridge
mapping and hardware notes (MX+, Jeep gray adapter). View it in the UI under
**Discovery**.

```bash
# Lab catalog (no hardware) — prints JSON
python -m obd_gateway --vehicle-id veh:jeep-renegade-2015-latitude \
  --simulate --dry-run discover

# Live probe + POST to API (omit --dry-run to ingest)
python -m obd_gateway --vehicle-id veh:jeep-renegade-2015-latitude discover
```

Then open **Discovery** in the web UI (or `GET /api/vehicles/:id/discovery`).

---

## 5. Ultimate integration plan (phased)

Goal: **map the MX+ ↔ vehicle OBD-II interface as thoroughly as standard modes
allow**, then deepen meaning in the ontology — without cloning AlfaOBD.

### Phase A — Prove the live pipe (S1)

- [ ] Pair MX+ on Linux with the Jeep + gray adapter; document working
      `AUTO_OBD_PORT` / quirks in a short note here or in the gateway README.
- [ ] One-shot `scan` → Dashboard shows live/sim source badge, DTCs (with
      dictionary text), gauges.
- [ ] Confirm freeze frame and Mode 06 appear when the ECU has them (or note
      “none this cycle” honestly).
- [ ] Repeat a shorter smoke on the Silverado (auto-detect protocol).

### Phase B — Thorough Mode 01 mapping

- [x] Run gateway `discover` (or simulate) → **Discovery** page shows support
      vs ontology mapping (Phase B kickoff).
- [ ] After a live Jeep session, log which PIDs in `STANDARD_PID_COMMANDS`
      returned data vs unsupported.
- [ ] Expand `DEFAULT_PIDS` / dictionary only for PIDs that actually help
      cartridges or operator gauges (no vanity polling).
- [ ] Keep units grounded in `pid-dictionary.json`.

### Phase C — Monitors & readiness depth

- [ ] Drive cycles until readiness / Mode 06 tests populate where possible.
- [ ] Grow `mode06-dictionary.json` only with SAE/ISO OBDMID meaning (never
      invent TID charts).
- [ ] Optionally surface readiness / incomplete monitors more clearly in UI
      (backlog polish).

### Phase D — Freeze frame & permanence

- [ ] Capture FF on real DTCs; verify ClassEvidence / report include them.
- [ ] When python-OBD (or a thin AT command path) supports Mode 0A, add
      permanent DTCs without weakening the “no clear from edge” rule.

### Phase E — Session-grade diagnostics

- [ ] Prefer `watch` + DriveSession for drives; prune PID noise, keep
      FF/Mode06/DTC evidence.
- [ ] Use Diagnosis draft/solve + recommendations; record outcomes so
      calibration can learn.

### Phase F — Meaning & OEM depth (off the bus)

- [ ] Fill DTC/PID/Mode 06 dictionaries from J1979/J2012 (and cited TSBs).
- [ ] Jeep MultiAir / campaigns: keep curated; verify enhanced P1xxx against
      service literature (AlfaOBD may be a *verification* tool, not a required
      runtime dependency).
- [ ] Silverado Vortec stub: only add GM-specific classes with cited sources.

### Explicitly later / non-goals

- Cloning AlfaOBD session decoding into `obd-gateway`
- In-app bi-directional Proxi over MX+ (until an explicit enhanced-session project)
- Claiming dealer-complete coverage from Mode 01–07 alone

---

## 5b. Proxi alignment (Jeep Renegade — stuck in Park / flashing odo)

**UI:** select the Jeep → **Functions** → **Proxi alignment (module configuration sync)**.

After battery death/disconnect (or some module/radio work), FCA next-gen ECUs can
lose their handshake with the **BCM** (Proxi master). Classic symptoms: stuck in
Park, flashing odometer, ABS/traction lights.

| Step | What to do |
|---|---|
| Detect | Full-module enhanced scan (AlfaOBD/wiTECH). Note which ECUs report configuration-mismatch / Proxi faults (often TCM). Standard Mode 03 alone is not enough. |
| Align | AlfaOBD → Jeep → Renegade → Body computer → **PROXI alignment** → Start → follow prompts (often key off → **gray adapter** + MX+ → key on → Finished) → start engine. |
| Verify | Shift out of Park; odometer steady; mismatch DTCs gone on re-scan. |
| Log | In Functions: **Start guided run** before/during; **Mark completed** / **failed** after so the Journal keeps a case trail. |

Auto-architect does **not** send Proxi commands on the standard OBD path. Full
step text lives in `packages/ontology/special-procedures.json` and the Functions UI.

---

## 6. “Most useful information” checklist (per vehicle)

When you want the best picture before trusting recognition:

1. Correct vehicle id selected in UI and gateway  
2. Ignition on; gray adapter + MX+ seated (Jeep)  
3. At least one successful live `scan` (source badge = live / obd_gateway)  
4. Stored/pending DTCs reviewed (dictionary descriptions present)  
5. Freeze frame present if a DTC is stored (or noted absent)  
6. Mode 06 rows for relevant monitors after a drive cycle when possible  
7. Live gauges not stale if diagnosing now  
8. Jeep oil concerns: manual oil PIDs or honest gap noted  
9. Campaigns page checked for W80/W84 / TSB matches  
10. Jeep stuck in Park / flashing odo after battery work → Functions → Proxi  
11. Report exported if sharing a case  

---

## 7. Troubleshooting (short)

| Symptom | Try |
|---|---|
| Cannot connect | Ignition on; reseat gray adapter + MX+; re-bind rfcomm; `--verbose` |
| Empty PIDs | Engine running; widen `--pids` only after a support check |
| Wrong conclusions | Wrong `--vehicle-id`; simulated batch mistaken for live |
| No Mode 06 / FF | ECU may not have data this cycle — not a gateway “healthy” claim |
| Protocol errors (truck) | Clear forced protocol; allow auto-detect |
| Stuck in Park / flashing odo after battery | Functions → Proxi; AlfaOBD + gray adapter — not gateway `scan` alone |

---

## 8. Where meaning lives (so the map stays honest)

| Concern | Source of truth |
|---|---|
| Vehicle / engine family | `packages/ontology/vehicle-profiles.json` |
| DTC / PID / Mode 06 text | `*-dictionary.json` |
| Fault proof | Cartridges + LOGOS realize (API) |
| Edge read rules | `OBD_EDGE_CONTRACT.md` + gateway |

When tempted to add a flashy OEM screen: prefer a dictionary row, a cartridge
rule, or a FUTURE_FEATURES item — not a one-off UI string.
