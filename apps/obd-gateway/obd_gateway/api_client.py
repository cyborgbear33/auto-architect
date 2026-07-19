"""
Posts Observation batches to the API. This is the only network egress point
in obd-gateway — it never calls the LOGOS bridge and never writes to a
store directly, matching the "edge devices only report validated
observations" rule (see docs/AI_HANDOFF.md).
"""
from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

import requests

logger = logging.getLogger("obd_gateway.api_client")


class ApiClientError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class ApiClient:
    def __init__(self, base_url: str, timeout_seconds: float = 10.0, session: requests.Session | None = None):
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.session = session or requests.Session()

    def post_observation_batch(self, vehicle_id: str, batch: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}/api/vehicles/{quote(vehicle_id, safe='')}/observations"
        try:
            response = self.session.post(url, json=batch, timeout=self.timeout_seconds)
        except requests.RequestException as exc:
            raise ApiClientError(f"could not reach the API at {url}: {exc}") from exc
        if response.status_code >= 400:
            body: Any
            try:
                body = response.json()
            except ValueError:
                body = response.text
            raise ApiClientError(
                f"API rejected the observation batch (HTTP {response.status_code})",
                status_code=response.status_code,
                body=body,
            )
        try:
            return response.json()
        except ValueError:
            return {}
