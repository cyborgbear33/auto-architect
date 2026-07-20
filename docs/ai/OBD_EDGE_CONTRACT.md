# OBD_EDGE_CONTRACT.md

Normative rules for the OBD-II / CANBUS edge layer (`apps/obd-gateway`).

This is the **custom domain layer** on top of the shared propose/dispose
architecture. Garden's equivalent is `EDGE_DEVICE_DEV_GUIDE.md` (MQTT sensors).
Auto's edge is a serial/Bluetooth ELM327-compatible adapter (OBDLink MX+).

Operator install/CLI detail: [`apps/obd-gateway/README.md`](../../apps/obd-gateway/README.md).  
Human setup + phased MX+ integration plan: [`OPERATOR_OBD_MANUAL.md`](../OPERATOR_OBD_MANUAL.md).

---

## 1. Hard boundary

`obd-gateway` **may**:

- connect to an adapter
- read standard OBD-II modes
- tag batches with a `vehicleId`
- POST validated observation batches to the API
- run `--simulate` / `--dry-run` for lab work

`obd-gateway` **must not**:

- import `@auto/logos-bridge` or call LOGOS
- decide fault classes, recommendations, or safety policy
- write to the API store except via `POST .../observations`
- clear codes, flash ECUs, or run bi-directional controls (out of scope)
- depend on AlfaOBD proprietary session decoding for MVP correctness

Classification, policy, and ranking live exclusively in `apps/api`.

---

## 2. Supported evidence (MVP)

| Mode | Content | Status |
|---|---|---|
| 01 | Live PIDs | primary |
| 02 | Freeze frame | gateway populates when ECU exposes a freeze DTC + Mode 02 PIDs |
| 03 / 07 / 0A | Stored / pending / permanent DTCs | 03/07 primary; 0A not in python-OBD yet |
| 06 | On-board monitor results | gateway populates SAE-seed OBDMIDs when ECU supports them |

Manual / simulated PIDs are allowed for tests (`--manual-pid`, `--simulate`).

---

## 3. Observation batch contract

Gateway builds the shape expected by `@auto/validation` `ObservationBatchSchema`
and `POST /api/vehicles/:id/observations`.

Minimum expectations:

- `vehicleId` matches the path / configured profile
- timestamps in ISO-8601
- DTC codes uppercase canonical form (`P0304`)
- PID keys stable (see `obd_gateway/pid_map.py`) with numeric values + units when known
- source metadata when simulate vs live can be distinguished (prefer explicit)

If the API rejects a batch, fix the gateway or schema — do not loosen validation
silently in the UI.

---

## 4. Vehicle tagging

Every batch is for exactly one vehicle profile id
(e.g. `veh:jeep-renegade-2015-latitude`). Wrong vehicle id is a data-corruption
bug: recognition will run the wrong engine-family cartridges.

---

## 5. Safety

- Reading DTCs/PIDs is in scope.
- **Clearing codes is not an edge privilege.** Any clear-codes action is an API
  action subject to `PolicyService` / LOGOS `reason`.
- Do not add "clear and hope" shortcuts to the gateway CLI.

---

## 6. Reliability rules

- Prefer one-shot `scan` for shop stops; `watch` for drive logging.
- `discover` may probe ECU **support** (e.g. `conn.supports(...)` / PID support
  bitmasks) for Mode 01 keys, Mode 06 MIDs, freeze frame, Mode 03/07, and VIN.
  It must not clear codes, write to the vehicle, or dump full PID **values**
  (values remain `scan` / `watch`).
- Timeouts and adapter disconnects should fail visibly (non-zero exit / log),
  not invent zeroed PIDs that look like real data.
- `--simulate` exists so CI and UI demos never require hardware.

---

## 7. Extension guidance

When adding a PID:

1. Add a row to `packages/ontology/pid-dictionary.json` (unit + Mode 01 hex, or `manualOnly`)
2. Map it in `pid_map.py` (or mark manual-only)
3. Ensure the API/observation schema accepts it
4. Only then add cartridge perception thresholds
5. Use the dictionary unit in UI / gauges (do not invent a parallel unit string)

When tempted to decode OEM enhanced CAN: put that behind an explicit future
feature and keep standard OBD as the supported path. See `FUTURE_FEATURES.md`
non-goals.

Standards grounding (J1979 PIDs, J2012 DTCs, ISO 15765-4, UDS, J1939):
[`HARDWARE_STANDARDS.md`](HARDWARE_STANDARDS.md).
