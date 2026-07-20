"""
Pure builders for OBD capability discovery reports (support probe, not value dump).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from .pid_map import MANUAL_ONLY_PIDS, STANDARD_MODE06_COMMANDS, STANDARD_PID_COMMANDS


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def build_simulated_capability_report(*, vehicle_id: str) -> dict[str, Any]:
    """Catalog of what the gateway knows how to ask — ECU support left unknown."""
    return {
        "vehicleId": vehicle_id,
        "capturedAt": now_iso(),
        "source": "simulated",
        "connection": {
            "connected": False,
            "port": None,
            "protocolId": None,
            "protocolName": None,
        },
        "modes": {
            "mode01": {
                "supported": [],
                "unsupported": [],
                "unknown": sorted(STANDARD_PID_COMMANDS.keys()),
            },
            "mode02FreezeFrame": {"supported": None},
            "mode03Dtcs": {"supported": None},
            "mode07Pending": {"supported": None},
            "mode06": {
                "supportedMids": [],
                "unsupportedMids": [],
                "unknownMids": sorted(STANDARD_MODE06_COMMANDS.keys()),
            },
            "vin": {"supported": None},
        },
        "manualOnlyPids": sorted(MANUAL_ONLY_PIDS.keys()),
    }


def partition_support(
    keys: list[str], support_map: dict[str, bool | None]
) -> tuple[list[str], list[str], list[str]]:
    supported: list[str] = []
    unsupported: list[str] = []
    unknown: list[str] = []
    for key in keys:
        flag = support_map.get(key)
        if flag is True:
            supported.append(key)
        elif flag is False:
            unsupported.append(key)
        else:
            unknown.append(key)
    return supported, unsupported, unknown
