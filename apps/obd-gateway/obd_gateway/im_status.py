"""
Mode 01 PID $01 STATUS → structured I/M readiness (not a float PID).

python-OBD decodes STATUS into a Status object with StatusTest children;
we serialize only *available* monitors so the API never invents readiness
from empty DTCs or unsupported bits.
"""

from __future__ import annotations

from typing import Any


def serialize_im_status(status: Any) -> dict[str, Any] | None:
    """Convert a python-OBD Status (or duck-type) into ImStatusObservation."""
    if status is None:
        return None

    monitors: list[dict[str, Any]] = []
    for key, value in getattr(status, "__dict__", {}).items():
        if key in ("MIL", "DTC_count", "ignition_type"):
            continue
        available = getattr(value, "available", None)
        complete = getattr(value, "complete", None)
        name = getattr(value, "name", None) or key
        if available is None or complete is None:
            continue
        if not available:
            continue
        monitors.append(
            {
                "name": str(name),
                "available": True,
                "complete": bool(complete),
            }
        )

    monitors.sort(key=lambda m: m["name"])
    all_complete = bool(monitors) and all(m["complete"] for m in monitors)
    return {
        "mil": bool(getattr(status, "MIL", False)),
        "dtcCount": int(getattr(status, "DTC_count", 0) or 0),
        "ignitionType": str(getattr(status, "ignition_type", "") or ""),
        "monitors": monitors,
        "allComplete": all_complete,
    }


def simulated_im_status(*, incomplete_evap: bool = True) -> dict[str, Any]:
    """Honest software-path STATUS — not a smog-ready invent from empty DTCs."""
    monitors = [
        {"name": "MISFIRE_MONITORING", "available": True, "complete": True},
        {"name": "FUEL_SYSTEM_MONITORING", "available": True, "complete": True},
        {"name": "COMPONENT_MONITORING", "available": True, "complete": True},
        {
            "name": "CATALYST_MONITORING",
            "available": True,
            "complete": not incomplete_evap,
        },
        {
            "name": "EVAPORATIVE_SYSTEM_MONITORING",
            "available": True,
            "complete": not incomplete_evap,
        },
        {"name": "OXYGEN_SENSOR_MONITORING", "available": True, "complete": True},
    ]
    all_complete = all(m["complete"] for m in monitors)
    return {
        "mil": False,
        "dtcCount": 0,
        "ignitionType": "spark",
        "monitors": monitors,
        "allComplete": all_complete,
    }
