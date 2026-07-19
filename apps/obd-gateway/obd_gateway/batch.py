"""
Pure, hardware-free functions that assemble an `Observation` batch dict
matching `ObservationBatchSchema` (packages/validation/src/index.ts). Kept
separate from client.py so these are trivially unit-testable.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_manual_pids(pairs: list[str]) -> list[dict[str, Any]]:
    """Parses repeated `--manual-pid KEY=VALUE[:UNIT]` CLI args into PidReading
    dicts. e.g. `OIL_PRESSURE_PSI=8:psi` -> {"pid": "OIL_PRESSURE_PSI", "value": 8.0, "unit": "psi"}."""
    readings: list[dict[str, Any]] = []
    for pair in pairs:
        if "=" not in pair:
            raise ValueError(f"--manual-pid must look like KEY=VALUE or KEY=VALUE:UNIT, got {pair!r}")
        key, rest = pair.split("=", 1)
        unit = None
        if ":" in rest:
            rest, unit = rest.split(":", 1)
        try:
            value = float(rest)
        except ValueError as exc:
            raise ValueError(f"--manual-pid value must be numeric, got {pair!r}") from exc
        readings.append({"pid": key.strip().upper(), "value": value, "unit": unit, "timestamp": now_iso()})
    return readings


def build_observation_batch(
    *,
    vehicle_id: str,
    pid_readings: list[dict[str, Any]] | None = None,
    dtcs: list[dict[str, Any]] | None = None,
    manual_pids: list[dict[str, Any]] | None = None,
    odometer_miles: float | None = None,
    source: str = "obd_gateway",
    captured_at: str | None = None,
) -> dict[str, Any]:
    """Builds a batch dict ready to POST to `/api/vehicles/:id/observations`.
    Never invents a DTC or PID reading that wasn't actually read — an empty
    scan produces an (honest) near-empty batch, not a synthesized "healthy"
    reading."""
    all_pids = [*(pid_readings or []), *(manual_pids or [])]
    batch: dict[str, Any] = {
        "vehicleId": vehicle_id,
        "capturedAt": captured_at or now_iso(),
        "source": source,
    }
    if odometer_miles is not None:
        batch["odometerMiles"] = odometer_miles
    if dtcs:
        batch["dtcs"] = [{k: v for k, v in d.items() if v is not None} for d in dtcs]
    if all_pids:
        batch["pids"] = [{k: v for k, v in p.items() if v is not None} for p in all_pids]
    return batch
