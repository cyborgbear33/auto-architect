"""
Mode 0A permanent DTCs — thin AT path outside stock python-OBD.

python-OBD ships Mode 03 (`GET_DTC`) and Mode 07 (`GET_CURRENT_DTC`) only.
J1979 Mode 0A uses the same DTC payload layout, so we reuse its `dtc`
decoder with force=True queries (0A is never in Mode 01 support bitmaps).
"""

from __future__ import annotations

from obd.decoders import dtc
from obd.OBDCommand import OBDCommand
from obd.protocols import ECU

GET_PERMANENT_DTC = OBDCommand(
    "GET_PERMANENT_DTC",
    "Get permanent DTCs (Mode 0A)",
    b"0A",
    0,
    dtc,
    ECU.ALL,
    False,
)
