# OBD_EDGE_CONTRACT.md

Normative rules for the OBD-II / CANBUS edge layer (`apps/obd-gateway`).

This is the **custom domain layer** on top of the shared propose/dispose
architecture. Garden's equivalent is `EDGE_DEVICE_DEV_GUIDE.md` (MQTT sensors).
Auto's edge is a serial/Bluetooth ELM327-compatible adapter (OBDLink MX+).

Operator install/CLI detail: [`apps/obd-gateway/README.md`](../../apps/obd-gateway/README.md).

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
| 02 | Freeze frame | supported in API shape; gateway should populate when available |
| 03 / 07 / 0A | Stored / pending / permanent DTCs | primary |
| 06 | On-board monitor results | API exposes; gateway/UI richness still backlog |

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
- Timeouts and adapter disconnects should fail visibly (non-zero exit / log),
  not invent zeroed PIDs that look like real data.
- `--simulate` exists so CI and UI demos never require hardware.

---

## 7. Extension guidance

When adding a PID:

1. Map it in `pid_map.py` (or mark manual-only)
2. Ensure the API/observation schema accepts it
3. Only then add cartridge perception thresholds
4. Document units in UI copy

When tempted to decode OEM enhanced CAN: put that behind an explicit future
feature and keep standard OBD as the supported path. See `FUTURE_FEATURES.md`
non-goals.
