"""
Maps auto-architect's PID keys (the strings cartridges' perception rules
match on, e.g. `packages/cartridges/src/misfire.ts`'s `ENGINE_LOAD_PID`) to
python-OBD's `obd.commands.*` constants.

Kept as a plain dict, not a class, so it's trivially unit-testable and
inspectable without a hardware connection.

Canonical units + J1979 Mode 01 metadata for the thin SAE seed live in
`packages/ontology/pid-dictionary.json` (see `tests/test_pid_seed.py`). This
module only binds keys to python-OBD commands.

Some fault classes need PIDs standard Mode 01 does not universally expose on
every ECU (documented per-cartridge, e.g. `OIL_PRESSURE_PSI` in
fca-tigershark-2.4.ts, `OIL_LEVEL_PCT` in forecast.ts). Those are
intentionally left out of STANDARD_PID_COMMANDS — obd-gateway supports
`--manual-pid KEY=VALUE` for exactly this case; see README.md.
"""

from __future__ import annotations

import obd

STANDARD_PID_COMMANDS: dict[str, obd.OBDCommand] = {
    "RPM": obd.commands.RPM,
    "SPEED": obd.commands.SPEED,
    "ENGINE_LOAD": obd.commands.ENGINE_LOAD,
    "ABSOLUTE_LOAD": obd.commands.ABSOLUTE_LOAD,
    "COOLANT_TEMP": obd.commands.COOLANT_TEMP,
    "INTAKE_TEMP": obd.commands.INTAKE_TEMP,
    "AMBIANT_AIR_TEMP": obd.commands.AMBIANT_AIR_TEMP,
    "THROTTLE_POS": obd.commands.THROTTLE_POS,
    "RELATIVE_THROTTLE_POS": obd.commands.RELATIVE_THROTTLE_POS,
    "SHORT_FUEL_TRIM_1": obd.commands.SHORT_FUEL_TRIM_1,
    "LONG_FUEL_TRIM_1": obd.commands.LONG_FUEL_TRIM_1,
    "SHORT_FUEL_TRIM_2": obd.commands.SHORT_FUEL_TRIM_2,
    "LONG_FUEL_TRIM_2": obd.commands.LONG_FUEL_TRIM_2,
    "FUEL_LEVEL": obd.commands.FUEL_LEVEL,
    "FUEL_PRESSURE": obd.commands.FUEL_PRESSURE,
    "FUEL_RAIL_PRESSURE_DIRECT": obd.commands.FUEL_RAIL_PRESSURE_DIRECT,
    "INTAKE_PRESSURE": obd.commands.INTAKE_PRESSURE,
    "MAF": obd.commands.MAF,
    "TIMING_ADVANCE": obd.commands.TIMING_ADVANCE,
    "CONTROL_MODULE_VOLTAGE": obd.commands.CONTROL_MODULE_VOLTAGE,
    "O2_B1S1": obd.commands.O2_B1S1,
    "O2_B1S2": obd.commands.O2_B1S2,
    "O2_B2S1": obd.commands.O2_B2S1,
    "O2_B2S2": obd.commands.O2_B2S2,
    "COMMANDED_EGR": obd.commands.COMMANDED_EGR,
    "EGR_ERROR": obd.commands.EGR_ERROR,
    "BAROMETRIC_PRESSURE": obd.commands.BAROMETRIC_PRESSURE,
    "CATALYST_TEMP_B1S1": obd.commands.CATALYST_TEMP_B1S1,
    "CATALYST_TEMP_B2S1": obd.commands.CATALYST_TEMP_B2S1,
    "EVAP_VAPOR_PRESSURE": obd.commands.EVAP_VAPOR_PRESSURE,
    "COMMANDED_EVAPORATIVE_PURGE": obd.commands.EVAPORATIVE_PURGE,
    "RUN_TIME": obd.commands.RUN_TIME,
    "DISTANCE_W_MIL": obd.commands.DISTANCE_W_MIL,
}

# PID keys real cartridges reference (packages/cartridges/src/*.ts) that are
# NOT standard Mode 01 PIDs on every ECU and therefore only ever arrive via
# `--manual-pid`. Kept here so `obd_gateway --help` can point at the exact
# reason, instead of silently no-oping when a hoped-for PID never appears.
MANUAL_ONLY_PIDS: dict[str, str] = {
    "OIL_PRESSURE_PSI": "no numeric Mode 01 PID on most MY2015 Tigershark ECUs — read from a gauge/dipstick switch and pass via --manual-pid",
    "OIL_LEVEL_PCT": "oil level is not a Mode 01 PID — read from the dipstick/dash message and pass via --manual-pid",
}

# Mode 02 freeze-frame clones of STANDARD_PID_COMMANDS keys that python-OBD exposes
# as `DTC_<KEY>`. Used by client.read_freeze_frames — never invent readings.
FREEZE_FRAME_PID_COMMANDS: dict[str, obd.OBDCommand] = {
    key: cmd
    for key in STANDARD_PID_COMMANDS
    if (cmd := getattr(obd.commands, f"DTC_{key}", None)) is not None
}

# Mode 06 OBDMID hex → python-OBD MONITOR_* command. Keys match
# packages/ontology/mode06-dictionary.json (no $). Unknown MIDs stay unlabeled
# in the UI; do not invent TID meanings here.
STANDARD_MODE06_COMMANDS: dict[str, obd.OBDCommand] = {
    "01": obd.commands.MONITOR_O2_B1S1,
    "02": obd.commands.MONITOR_O2_B1S2,
    "05": obd.commands.MONITOR_O2_B2S1,
    "06": obd.commands.MONITOR_O2_B2S2,
    "21": obd.commands.MONITOR_CATALYST_B1,
    "22": obd.commands.MONITOR_CATALYST_B2,
    "31": obd.commands.MONITOR_EGR_B1,
    "35": obd.commands.MONITOR_VVT_B1,
    "36": obd.commands.MONITOR_VVT_B2,
    "39": obd.commands.MONITOR_EVAP_150,
    "3A": obd.commands.MONITOR_EVAP_090,
    "3B": obd.commands.MONITOR_EVAP_040,
    "3C": obd.commands.MONITOR_EVAP_020,
    "3D": obd.commands.MONITOR_PURGE_FLOW,
    "41": obd.commands.MONITOR_O2_HEATER_B1S1,
    "42": obd.commands.MONITOR_O2_HEATER_B1S2,
    "45": obd.commands.MONITOR_O2_HEATER_B2S1,
    "46": obd.commands.MONITOR_O2_HEATER_B2S2,
    "71": obd.commands.MONITOR_SECONDARY_AIR_1,
    "72": obd.commands.MONITOR_SECONDARY_AIR_2,
    "A1": obd.commands.MONITOR_MISFIRE_GENERAL,
    "A2": obd.commands.MONITOR_MISFIRE_CYLINDER_1,
    "A3": obd.commands.MONITOR_MISFIRE_CYLINDER_2,
    "A4": obd.commands.MONITOR_MISFIRE_CYLINDER_3,
    "A5": obd.commands.MONITOR_MISFIRE_CYLINDER_4,
}


def resolve_pid_keys(requested: tuple[str, ...]) -> tuple[list[str], list[str]]:
    """Split requested PID keys into (supported, unsupported) against STANDARD_PID_COMMANDS."""
    supported = [p for p in requested if p in STANDARD_PID_COMMANDS]
    unsupported = [p for p in requested if p not in STANDARD_PID_COMMANDS]
    return supported, unsupported


def mode06_mid_from_command(command: obd.OBDCommand) -> str:
    """Extract OBDMID hex from a Mode 06 command byte string (e.g. b'0621' → '21')."""
    raw = command.command
    text = raw.decode("ascii") if isinstance(raw, bytes) else str(raw)
    return text[2:].upper()
