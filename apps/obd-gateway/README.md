# obd-gateway

The edge layer for auto-architect. Talks directly to an OBDLink MX+ (or any
ELM327-compatible adapter) over Bluetooth/USB via
[python-OBD](https://github.com/brendan-w/python-OBD) — no AlfaOBD, no
enhanced-FCA-CAN reverse engineering. It reads standard Mode 01 PIDs and
Mode 03/07 DTCs and POSTs validated `Observation` batches to
`POST /api/vehicles/:id/observations`.

Per the layering rule in [`docs/AI_HANDOFF.md`](../../docs/AI_HANDOFF.md) and
the normative [`docs/ai/OBD_EDGE_CONTRACT.md`](../../docs/ai/OBD_EDGE_CONTRACT.md):
**obd-gateway never imports the LOGOS bridge and never writes to a store
directly.** It only ever reports what it actually measured — an empty scan
produces a near-empty batch, never a synthesized "all clear."

## Install

```bash
# from the repo root, using the shared .venv (same one logos is installed into)
../../.venv/bin/pip install -r requirements.txt
# or, standalone:
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

For development/tests (from repo root):

```bash
pnpm obd-gateway:install   # pytest + ruff into the shared .venv
pnpm obd-gateway:lint      # Ruff check + format --check
pnpm obd-gateway:test      # pytest
```

## Usage

Two modes:

```bash
# one-shot: connect, read PIDs + DTCs once, POST one batch, exit
python -m obd_gateway --vehicle-id veh:jeep-renegade-2015-latitude scan

# continuous polling for a drive — repeats scan every --interval seconds
python -m obd_gateway --vehicle-id veh:jeep-renegade-2015-latitude watch --interval 5
```

Try it with no hardware and no API running first:

```bash
python -m obd_gateway --vehicle-id veh:jeep-renegade-2015-latitude \
  --simulate --dry-run \
  --manual-pid OIL_PRESSURE_PSI=8:psi \
  --simulate-dtc P0304:stored \
  scan
```

`--simulate` skips the OBD hardware connection entirely (only
`--manual-pid`/`--simulate-dtc` values go in the batch); `--dry-run` prints
the batch instead of POSTing it. Drop both once the adapter and API are
live.

## Configuration

Environment variables (all overridable by CLI flags):

| Variable | Default | Meaning |
| --- | --- | --- |
| `AUTO_VEHICLE_ID` | *(required)* | vehicle profile id, e.g. `veh:jeep-renegade-2015-latitude` (see `packages/ontology/vehicle-profiles.json`) |
| `AUTO_API_BASE_URL` | `http://localhost:4100` | auto-architect API base URL |
| `AUTO_OBD_PORT` | *(auto-detect)* | serial/BT device path, e.g. `/dev/rfcomm0` or `COM5` |
| `AUTO_OBD_BAUDRATE` | *(adapter default)* | override if auto-detect picks the wrong rate |
| `AUTO_OBD_PROTOCOL` | *(auto-detect)* | force a protocol id instead of auto-detect |
| `AUTO_OBD_FAST` | `true` | python-OBD "fast" mode (skips some safety padding) |
| `AUTO_POLL_INTERVAL_SECONDS` | `5.0` | `watch` mode poll interval |
| `AUTO_PIDS` | see `config.py` `DEFAULT_PIDS` | comma-separated PID keys to poll each cycle |
| `AUTO_REQUEST_TIMEOUT_SECONDS` | `10.0` | HTTP timeout when POSTing to the API |

## Pairing an OBDLink MX+ over Bluetooth (Linux)

```bash
bluetoothctl
> scan on
> pair AA:BB:CC:DD:EE:FF
> trust AA:BB:CC:DD:EE:FF
> exit
sudo rfcomm bind 0 AA:BB:CC:DD:EE:FF 1
# now /dev/rfcomm0 is the adapter's serial port
AUTO_OBD_PORT=/dev/rfcomm0 python -m obd_gateway --vehicle-id veh:jeep-renegade-2015-latitude scan
```

USB is simpler: plug in, then point `AUTO_OBD_PORT` at whatever
`/dev/ttyUSB*` (Linux) or `COMx` (Windows) shows up.

## PIDs that need `--manual-pid`

Some fault classes (see `packages/cartridges/src/fca-tigershark-2.4.ts`,
`apps/api/src/services/forecast.ts`) key off readings that aren't a
standard Mode 01 PID on every ECU — e.g. `OIL_PRESSURE_PSI` (many MY2015
Renegade PCMs only expose an oil pressure *switch*, not a transducer) and
`OIL_LEVEL_PCT` (dipstick/dash message only). `pid_map.MANUAL_ONLY_PIDS`
documents exactly which keys these are and why; pass them with
`--manual-pid KEY=VALUE[:UNIT]` (repeatable), e.g.:

```bash
python -m obd_gateway --vehicle-id veh:jeep-renegade-2015-latitude \
  --manual-pid OIL_PRESSURE_PSI=8:psi --manual-pid OIL_LEVEL_PCT=60 scan
```

## Architecture

```
obd_gateway/
├── config.py      env-driven GatewayConfig, CLI-overridable
├── pid_map.py      PID key -> obd.commands.* mapping (pure, unit-tested)
├── client.py       ObdGatewayClient: the only module that touches hardware
├── batch.py        pure functions: build an Observation batch dict
├── api_client.py    requests-based POST to /api/vehicles/:id/observations
└── cli.py          argparse CLI: scan / watch, --simulate, --dry-run
```

`client.py` is the only hardware boundary; everything downstream
(`batch.py`, `api_client.py`, `cli.py`) is pure/network-mockable and unit
tested with fakes — same "fake the boundary, not the logic" pattern
`@auto/logos-bridge`'s `FakeLogosBridge` uses on the TypeScript side.
