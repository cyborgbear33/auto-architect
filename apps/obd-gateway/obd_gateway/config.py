"""
Environment-driven configuration, CLI-overridable. Mirrors the pattern in
apps/api/src/config.ts: one place to load settings, sane defaults, no magic
strings scattered through the codebase.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

DEFAULT_PIDS = (
    "RPM",
    "SPEED",
    "ENGINE_LOAD",
    "COOLANT_TEMP",
    "SHORT_FUEL_TRIM_1",
    "LONG_FUEL_TRIM_1",
    "SHORT_FUEL_TRIM_2",
    "LONG_FUEL_TRIM_2",
    "INTAKE_TEMP",
    "THROTTLE_POS",
    "CONTROL_MODULE_VOLTAGE",
)


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    return float(raw) if raw else default


def _env_list(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw = os.environ.get(name)
    if not raw:
        return default
    return tuple(p.strip().upper() for p in raw.split(",") if p.strip())


@dataclass(frozen=True)
class GatewayConfig:
    api_base_url: str = field(
        default_factory=lambda: os.environ.get("AUTO_API_BASE_URL", "http://localhost:4100")
    )
    vehicle_id: str = field(default_factory=lambda: os.environ.get("AUTO_VEHICLE_ID", ""))
    obd_port: str | None = field(default_factory=lambda: os.environ.get("AUTO_OBD_PORT") or None)
    obd_baudrate: int | None = field(
        default_factory=lambda: int(os.environ["AUTO_OBD_BAUDRATE"])
        if os.environ.get("AUTO_OBD_BAUDRATE")
        else None
    )
    obd_protocol: str | None = field(
        default_factory=lambda: os.environ.get("AUTO_OBD_PROTOCOL") or None
    )
    obd_fast: bool = field(
        default_factory=lambda: os.environ.get("AUTO_OBD_FAST", "true").lower() != "false"
    )
    poll_interval_seconds: float = field(
        default_factory=lambda: _env_float("AUTO_POLL_INTERVAL_SECONDS", 5.0)
    )
    pids: tuple[str, ...] = field(default_factory=lambda: _env_list("AUTO_PIDS", DEFAULT_PIDS))
    request_timeout_seconds: float = field(
        default_factory=lambda: _env_float("AUTO_REQUEST_TIMEOUT_SECONDS", 10.0)
    )

    def require_vehicle_id(self) -> str:
        if not self.vehicle_id:
            raise ValueError(
                "no vehicle id configured — set AUTO_VEHICLE_ID or pass --vehicle-id "
                "(e.g. veh:jeep-renegade-2015-latitude; see packages/ontology/vehicle-profiles.json)"
            )
        return self.vehicle_id
