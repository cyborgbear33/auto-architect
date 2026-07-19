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
from .pid_map import STANDARD_PID_COMMANDS, resolve_pid_keys

logger = logging.getLogger("obd_gateway.client")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


class ObdGatewayClient:
    """Connects to an ELM327-compatible adapter (OBDLink MX+ included) and
    reads Mode 01 PIDs plus 03/07 (stored/pending) DTCs. Never writes state
    beyond an optional explicit `clear_dtcs()` call the CLI gates behind a
    confirmation flag — mirrors ActionService's mutation gate, one level down."""

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
            magnitude = getattr(value, "magnitude", value)
            unit = str(getattr(value, "units", "")) or None
            readings.append(
                {"pid": key, "value": float(magnitude), "unit": unit, "timestamp": _now_iso()}
            )
        return readings

    def read_dtcs(self) -> list[dict[str, Any]]:
        """Reads stored (Mode 03) + pending (Mode 07) DTCs and tags each with
        its status, matching `DtcObservationSchema`."""
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
        return dtcs

    def read_vin(self) -> str | None:
        conn = self._require_connection()
        if not conn.supports(obd.commands.VIN):
            return None
        response = conn.query(obd.commands.VIN)
        return None if response.is_null() else str(response.value)
