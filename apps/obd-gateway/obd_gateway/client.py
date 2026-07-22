"""
Thin wrapper around python-OBD's connection. This is the only module that
touches hardware — everything downstream of `read_*` deals in plain
dicts/tuples so `batch.py` and the CLI stay unit-testable without an
OBDLink MX+ plugged in.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import obd

from .config import GatewayConfig
from .discovery import now_iso as discovery_now_iso
from .mode0a import GET_PERMANENT_DTC
from .pid_map import (
    FREEZE_FRAME_PID_COMMANDS,
    MANUAL_ONLY_PIDS,
    STANDARD_MODE06_COMMANDS,
    STANDARD_PID_COMMANDS,
    resolve_pid_keys,
)

logger = logging.getLogger("obd_gateway.client")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _magnitude(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(getattr(value, "magnitude", value))
    except (TypeError, ValueError):
        return None


def _unit_of(value: Any) -> str | None:
    unit = str(getattr(value, "units", "") or "") or None
    return unit


def _call_or_attr(obj: Any, name: str) -> str | None:
    """Read python-OBD protocol helpers whether exposed as method or property."""
    raw = getattr(obj, name, None)
    if raw is None:
        return None
    try:
        value = raw() if callable(raw) else raw
    except Exception:  # noqa: BLE001 — adapter quirks must not abort discovery
        return None
    return str(value) if value is not None else None


def _freeze_dtc_code(value: Any) -> str | None:
    """python-OBD's single_dtc decoder returns (code, description) or None."""
    if value is None:
        return None
    if isinstance(value, tuple) and value:
        code = value[0]
        return str(code).upper() if code else None
    if isinstance(value, str) and value.strip():
        return value.strip().upper()
    return None


class ObdGatewayClient:
    """Connects to an ELM327-compatible adapter (OBDLink MX+ included) and
    reads Mode 01 PIDs, Mode 02 freeze frame, Mode 03/07/0A DTCs, and Mode 06
    monitor results. Never writes state beyond an optional explicit
    `clear_dtcs()` call the CLI gates behind a confirmation flag — mirrors
    ActionService's mutation gate, one level down."""

    def __init__(self, config: GatewayConfig, connection: obd.OBD | None = None):
        self.config = config
        self._connection = connection

    def connect(self) -> None:
        if self._connection is not None:
            return
        logger.info(
            "connecting to OBD adapter port=%s protocol=%s",
            self.config.obd_port,
            self.config.obd_protocol,
        )
        self._connection = obd.OBD(
            portstr=self.config.obd_port,
            baudrate=self.config.obd_baudrate,
            protocol=self.config.obd_protocol,
            fast=self.config.obd_fast,
        )
        if not self._connection.is_connected():
            raise ConnectionError(
                "could not connect to an OBD-II adapter — check the OBDLink MX+ is paired/plugged in, "
                "the ignition is on, and AUTO_OBD_PORT (if set) is correct"
            )

    def close(self) -> None:
        if self._connection is not None:
            self._connection.close()
            self._connection = None

    def _require_connection(self) -> obd.OBD:
        if self._connection is None:
            raise RuntimeError("not connected — call connect() first")
        return self._connection

    def read_pids(self, pid_keys: tuple[str, ...]) -> list[dict[str, Any]]:
        """Read each requested PID once. Skips PIDs the adapter/ECU doesn't
        support (STATUS query first) and PIDs with no data this cycle —
        never fabricates a reading."""
        conn = self._require_connection()
        supported_keys, unsupported_keys = resolve_pid_keys(pid_keys)
        for key in unsupported_keys:
            logger.warning(
                "skipping %s — not a standard Mode 01 PID, pass it via --manual-pid instead", key
            )

        readings: list[dict[str, Any]] = []
        for key in supported_keys:
            command = STANDARD_PID_COMMANDS[key]
            if not conn.supports(command):
                logger.debug("ECU does not support %s, skipping", key)
                continue
            response = conn.query(command)
            if response.is_null():
                logger.debug("no data for %s this cycle, skipping", key)
                continue
            value = response.value
            magnitude = _magnitude(value)
            if magnitude is None:
                continue
            readings.append(
                {
                    "pid": key,
                    "value": magnitude,
                    "unit": _unit_of(value),
                    "timestamp": _now_iso(),
                }
            )
        return readings

    def read_dtcs(self) -> list[dict[str, Any]]:
        """Reads stored (Mode 03), pending (Mode 07), and permanent (Mode 0A)
        DTCs and tags each with its status, matching `DtcObservationSchema`.
        Mode 0A uses a thin custom command — python-OBD has no GET_PERMANENT_DTC
        and never lists 0A in Mode 01 support bitmaps, so we force the query and
        treat null/empty as no permanent codes (never invent)."""
        conn = self._require_connection()
        dtcs: list[dict[str, Any]] = []
        stored = conn.query(obd.commands.GET_DTC)
        if not stored.is_null():
            for code, description in stored.value:
                dtcs.append({"code": code, "status": "stored", "description": description or None})
        if conn.supports(obd.commands.GET_CURRENT_DTC):
            pending = conn.query(obd.commands.GET_CURRENT_DTC)
            if not pending.is_null():
                for code, description in pending.value:
                    dtcs.append(
                        {"code": code, "status": "pending", "description": description or None}
                    )
        permanent = self._query_permanent_dtcs(conn)
        if permanent is not None and not permanent.is_null() and permanent.value:
            for code, description in permanent.value:
                dtcs.append(
                    {"code": code, "status": "permanent", "description": description or None}
                )
        return dtcs

    def _query_permanent_dtcs(self, conn: obd.OBD) -> Any:
        """Mode 0A via force=True when the connection supports kwargs (live OBD)."""
        try:
            return conn.query(GET_PERMANENT_DTC, force=True)
        except TypeError:
            # Test doubles that only accept the command positional.
            return conn.query(GET_PERMANENT_DTC)

    def read_freeze_frames(self) -> list[dict[str, Any]]:
        """Mode 02 freeze frame for the DTC that triggered it. Omits the whole
        frame when no freeze DTC is present — never invents a DTC or PID."""
        conn = self._require_connection()
        freeze_cmd = obd.commands.DTC_FREEZE_DTC
        if not conn.supports(freeze_cmd):
            # Some stacks expose Mode 01 $02 instead; try as a last resort.
            freeze_cmd = obd.commands.FREEZE_DTC
            if not conn.supports(freeze_cmd):
                logger.debug("ECU does not support freeze-frame DTC query")
                return []

        response = conn.query(freeze_cmd)
        if response.is_null():
            return []
        dtc = _freeze_dtc_code(response.value)
        if not dtc:
            return []

        readings: list[dict[str, Any]] = []
        for key, command in FREEZE_FRAME_PID_COMMANDS.items():
            if not conn.supports(command):
                continue
            pid_response = conn.query(command)
            if pid_response.is_null():
                continue
            magnitude = _magnitude(pid_response.value)
            if magnitude is None:
                continue
            readings.append(
                {
                    "pid": key,
                    "value": magnitude,
                    "unit": _unit_of(pid_response.value),
                    "timestamp": _now_iso(),
                }
            )

        return [{"dtc": dtc, "readings": readings}]

    def read_mode06(self) -> list[dict[str, Any]]:
        """Mode 06 on-board monitor tests for OBDMIDs in STANDARD_MODE06_COMMANDS.
        Skips unsupported MIDs and null tests; never invents pass/fail."""
        conn = self._require_connection()
        results: list[dict[str, Any]] = []
        for mid, command in STANDARD_MODE06_COMMANDS.items():
            if not conn.supports(command):
                logger.debug("ECU does not support Mode 06 MID %s, skipping", mid)
                continue
            response = conn.query(command)
            if response.is_null() or response.value is None:
                continue
            monitor = response.value
            tests = getattr(monitor, "tests", None)
            if tests is None:
                continue
            for test in tests:
                if getattr(test, "is_null", lambda: True)():
                    continue
                tid_raw = getattr(test, "tid", None)
                if tid_raw is None:
                    continue
                try:
                    tid = f"{int(tid_raw):02X}"
                except (TypeError, ValueError):
                    tid = str(tid_raw).upper()
                value = _magnitude(getattr(test, "value", None))
                min_v = _magnitude(getattr(test, "min", None))
                max_v = _magnitude(getattr(test, "max", None))
                if value is None:
                    continue
                passed = getattr(test, "passed", None)
                if not isinstance(passed, bool):
                    passed = None
                results.append(
                    {
                        "tid": tid,
                        "mid": mid,
                        "value": value,
                        "min": min_v,
                        "max": max_v,
                        "passed": passed,
                    }
                )
        return results

    def read_vin(self) -> str | None:
        conn = self._require_connection()
        if not conn.supports(obd.commands.VIN):
            return None
        response = conn.query(obd.commands.VIN)
        return None if response.is_null() else str(response.value)

    def discover_capabilities(self, *, vehicle_id: str) -> dict[str, Any]:
        """Probe ECU/adapter support for gateway-seeded OBD modes — no value dump."""
        conn = self._require_connection()
        mode01_supported: list[str] = []
        mode01_unsupported: list[str] = []
        for key, command in sorted(STANDARD_PID_COMMANDS.items()):
            if conn.supports(command):
                mode01_supported.append(key)
            else:
                mode01_unsupported.append(key)

        mode06_supported: list[str] = []
        mode06_unsupported: list[str] = []
        for mid, command in sorted(STANDARD_MODE06_COMMANDS.items()):
            if conn.supports(command):
                mode06_supported.append(mid)
            else:
                mode06_unsupported.append(mid)

        freeze_supported = conn.supports(obd.commands.DTC_FREEZE_DTC) or conn.supports(
            obd.commands.FREEZE_DTC
        )
        mode07 = conn.supports(obd.commands.GET_CURRENT_DTC)
        vin_supported = conn.supports(obd.commands.VIN)

        port = getattr(conn, "port_name", None) or self.config.obd_port
        protocol_id = _call_or_attr(conn, "protocol_id")
        protocol_name = _call_or_attr(conn, "protocol_name")

        return {
            "vehicleId": vehicle_id,
            "capturedAt": discovery_now_iso(),
            "source": "obd_gateway",
            "connection": {
                "connected": True,
                "port": str(port) if port else None,
                "protocolId": protocol_id,
                "protocolName": protocol_name,
            },
            "modes": {
                "mode01": {
                    "supported": mode01_supported,
                    "unsupported": mode01_unsupported,
                    "unknown": [],
                },
                "mode02FreezeFrame": {"supported": freeze_supported},
                "mode03Dtcs": {"supported": True},
                "mode07Pending": {"supported": mode07},
                "mode06": {
                    "supportedMids": mode06_supported,
                    "unsupportedMids": mode06_unsupported,
                    "unknownMids": [],
                },
                "vin": {"supported": vin_supported},
            },
            "manualOnlyPids": sorted(MANUAL_ONLY_PIDS.keys()),
        }
