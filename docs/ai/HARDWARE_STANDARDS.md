# HARDWARE_STANDARDS.md

Grounding reference for OBD-II / CANBUS meaning. Do not invent PID names, DTC
descriptions, or protocol facts — cite a real standard, TSB, or service manual.

Companion docs:

- [`OBD_EDGE_CONTRACT.md`](OBD_EDGE_CONTRACT.md) — what `obd-gateway` may do
- [`ONTOLOGY_DEV_GUIDE.md`](ONTOLOGY_DEV_GUIDE.md) — DTC dictionary / TBox discipline
- [`FUTURE_FEATURES.md`](../FUTURE_FEATURES.md) — full PID/DTC knowledge-base backlog
- [`OPERATOR_OBD_MANUAL.md`](../OPERATOR_OBD_MANUAL.md) — human-readable MX+ setup + integration plan

---

## 0. Reference hardware (this project)

| Item | Note |
|---|---|
| Preferred adapter | **OBDLink MX+** (Bluetooth ELM327-compatible) |
| 2015 Jeep Renegade Latitude 2.4L | MX+ used with a **gray-type OBD-II adapter/extension** for better DLC access. Operator-confirmed; mechanical only — not a protocol or OEM-session unlock. Profile: `veh:jeep-renegade-2015-latitude`. |
| 2003 Silverado 2500 HD (gas) | Same MX+ family; leave protocol auto-detect. Profile: `veh:silverado-2500hd-2003`. |

Operator workflow and phased “thorough OBD map” plan:
[`OPERATOR_OBD_MANUAL.md`](../OPERATOR_OBD_MANUAL.md).

---

## 1. Standards we care about

| Standard | Covers | Relevance to auto-architect |
|---|---|---|
| **SAE J1979** / ISO 15031-5 | Mode 01 PIDs, freeze frame, monitor status | Primary live evidence (`pid_map.py`, Mode 01) |
| **SAE J2012** / ISO 15031-6 | DTC letter+digits + generic descriptions | DTC dictionary rows (`P0304`, etc.) |
| **ISO 15765-4** | OBD-II diagnostic messaging over CAN | What ELM327 / `python-OBD` actually speaks on modern cars |
| **SAE J1850 / ISO 9141-2 / ISO 14230 (KWP2000)** | Legacy OBD transport | Gateway does not special-case; `python-OBD` abstracts protocol detection |
| **ISO 14229 (UDS)** | Unified Diagnostic Services — enhanced / bidirectional | Explicitly out of scope for MVP (AlfaOBD-class tooling); name the spec, do not reverse-engineer OEM sessions |
| **SAE J1939** | Heavy-duty PGN-based CAN | Architecture fork if a class-3+ diesel is added — not "more PIDs" |
| **SAE J2534** | Pass-thru programming API | Only relevant if bi-directional control / flashing ever becomes a goal (non-goal today) |

---

## 2. CAN frame primer (enough vocabulary to extend Mode 06 / raw CAN later)

Classic CAN frames carry:

- **Arbitration ID** — who is talking (priority embedded in the ID)
- **DLC** — data length (0–8 bytes on classic CAN)
- **Data** — payload bytes
- **11-bit vs 29-bit** identifiers — passenger OBD typically uses 11-bit; J1939 uses 29-bit

On ISO 15765-4 OBD-over-CAN, request IDs are commonly in the `0x7DF` / `0x7E0+`
range and responses often appear as `0x7E8+` (module-dependent). Treat these as
transport details for the gateway — the API and ontology speak in PID keys and
DTC codes, not raw frames.

**CAN FD** increases payload size and bitrate. Do not assume classic 8-byte
limits when designing future raw-CAN features; the MVP path stays standard OBD
modes via ELM327/`python-OBD`.

---

## 3. DTC structure (SAE J2012)

Canonical form in this repo: uppercase five-character codes (`P0304`).

Rough shape:

1. **Letter** — `P` powertrain, `C` chassis, `B` body, `U` network
2. **Second digit** — `0` (and often `2`/`3` in later revisions) = SAE-generic;
   `1` (and some manufacturer ranges) = manufacturer-enhanced
3. Remaining digits identify the fault family / subsystem

**Rules:**

- SAE-generic descriptions may be curated into `dtc-dictionary.json` with
  `"sae": true` when they match J2012 / ISO 15031-6 wording.
- Manufacturer-enhanced codes must cite a public TSB / service-manual summary —
  never invent a description. See the disclaimer already in
  `packages/ontology/dtc-dictionary.json`.
- Unknown code → leave unknown / omit from dictionary; do not guess meaning.

---

## 4. PIDs (SAE J1979)

- Mode 01 PID keys in `apps/obd-gateway/obd_gateway/pid_map.py` should track
  stable SAE / `python-OBD` names (`ENGINE_LOAD`, `SHORT_FUEL_TRIM_1`, …).
- **Units + J1979 metadata** for the thin seed live in
  `packages/ontology/pid-dictionary.json` (canonical `unit`, optional `mode` /
  `pidHex`). Runtime readings may still carry python-OBD pint strings; the
  dictionary is what UI/gauges trust when no live read is available yet.
- PIDs that are not universal Mode 01 on every ECU stay in `MANUAL_ONLY_PIDS`
  (`manualOnly: true` in the dictionary) and arrive via `--manual-pid`.
- Adding a PID: dictionary row → `pid_map.py` command (or manual) → cartridge
  threshold → UI units (see `OBD_EDGE_CONTRACT.md` §7).

### Thin seed + gateway Mode 01 metadata (shipped)

`pid-dictionary.json` must cover:

1. Cartridge-perceived PIDs (thresholds / perception)
2. Gateway `DEFAULT_PIDS` (live poll)
3. Every key in `STANDARD_PID_COMMANDS` (`pid_map.py`) — units + Mode 01 hex
4. Manual-only oil keys (`OIL_PRESSURE_PSI`, `OIL_LEVEL_PCT`)

Bidirectional gate: `apps/obd-gateway/tests/test_pid_seed.py`. Do **not** paste a
full J1979 table — that remains the comprehensive KB backlog item.

---

## 5. Mode 06 (Service $06) — monitor meaning

CAN Mode $06 reports on-board monitor test results. Field convention in this
repo (`Mode06Result`):

| Field | Meaning |
|---|---|
| `mid` | SAE/ISO **OBDMID** (monitor), e.g. `21` = Catalyst Monitor Bank 1 |
| `tid` | Test ID **within** that monitor (standardized or manufacturer-scaled) |

**Rules:**

- Only name monitors that appear in **ISO 15031-5 / SAE J1979 Annex D** (or a
  cited OEM chart). Seed lives in `packages/ontology/mode06-dictionary.json`.
- Unknown OBDMIDs stay unlabeled and never feed recognition.
- Upstream O2 monitors (`$01` / `$05`) → `FailedO2MonitorBank*` (performance).
  Downstream (`$02` / `$06`) → `FailedO2DownstreamMonitorBank*`.
  EGR `$31` → `FailedEgrMonitor`; secondary air `$71` → `FailedSecondaryAirMonitor`.
- Legacy TID+CID (pre-CAN) vehicles are out of this thin seed; do not invent
  manufacturer TID charts.

Failed monitors with a dictionary `concept` assert a **Condition** via
cartridge perception and may OR into existing fault classes (A3).

## 6. How this maps to the ontology

| Artifact | Must be grounded in |
|---|---|
| `dtc-dictionary.json` rows | J2012 / ISO 15031-6 (generic) or real TSB/manual (enhanced) |
| `pid-dictionary.json` rows | J1979 / ISO 15031-5 (Mode 01) or documented manual source |
| `mode06-dictionary.json` rows | ISO 15031-5 / SAE J1979 Annex D OBDMIDs (CAN) |
| `pid_map.py` keys | Same keys as the dictionary; python-OBD command binding only |
| DL fault classes | Real diagnostic meaning; SAE-portable classes in `generic` view |
| OEM classes / cartridges | Engine-family view + documented OEM procedure |

The ontology owns *meaning*; standards own *whether that meaning is real*.

---

## 7. Hard rules

1. **Unknown → do not guess.** Prefer "insufficient evidence" / omit over a
   plausible-sounding wrong description.
2. **Cite the standard or TSB** when adding DTC/PID meaning.
3. **Keep UDS / proprietary enhanced sessions out of MVP** — track in
   `FUTURE_FEATURES.md` non-goals / backlog, do not sneak into `obd-gateway`.
4. **J1939 is a separate bus model** — do not stretch passenger OBD cartridges
   to cover it; add an explicit extension path when needed.
5. **Full PID/DTC knowledge base is backlog** — gateway-bound Mode 01 metadata
   and curated DTC rows (including P0456/P0316 on existing concepts) are the
   current floor; a comprehensive J1979/J2012 catalog remains the high-priority
   item in [`FUTURE_FEATURES.md`](../FUTURE_FEATURES.md). Do not claim full SAE
   coverage in disclaimers or UI.
