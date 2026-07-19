"""
Tests client.py against a FakeConnection double — no real ELM327/OBDLink
hardware needed, same "fake the boundary, not the logic" pattern as
FakeLogosBridge in @auto/logos-bridge.
"""
import obd

from obd_gateway.client import ObdGatewayClient
from obd_gateway.config import GatewayConfig


class FakeResponse:
    def __init__(self, value):
        self.value = value

    def is_null(self):
        return self.value is None


class FakeConnection:
    def __init__(self, supported: set, responses: dict):
        self._supported = supported
        self._responses = responses

    def is_connected(self):
        return True

    def supports(self, command):
        return command in self._supported

    def query(self, command):
        return FakeResponse(self._responses.get(command))

    def close(self):
        pass


def test_read_pids_skips_unsupported_and_null_readings():
    fake = FakeConnection(
        supported={obd.commands.RPM, obd.commands.ENGINE_LOAD},
        responses={obd.commands.RPM: 850.0, obd.commands.ENGINE_LOAD: None},
    )
    client = ObdGatewayClient(GatewayConfig(vehicle_id="veh:x"), connection=fake)
    readings = client.read_pids(("RPM", "ENGINE_LOAD", "SPEED"))
    assert len(readings) == 1
    assert readings[0]["pid"] == "RPM"
    assert readings[0]["value"] == 850.0


def test_read_pids_unwraps_pint_quantity_magnitude_and_units():
    ureg = obd.Unit
    quantity = 82.5 * ureg.percent
    fake = FakeConnection(supported={obd.commands.ENGINE_LOAD}, responses={obd.commands.ENGINE_LOAD: quantity})
    client = ObdGatewayClient(GatewayConfig(vehicle_id="veh:x"), connection=fake)
    readings = client.read_pids(("ENGINE_LOAD",))
    assert readings[0]["value"] == 82.5
    assert readings[0]["unit"] == "percent"


def test_read_dtcs_tags_stored_and_pending():
    fake = FakeConnection(
        supported={obd.commands.GET_CURRENT_DTC},
        responses={
            obd.commands.GET_DTC: [("P0304", "Cylinder 4 Misfire Detected")],
            obd.commands.GET_CURRENT_DTC: [("P0171", "System Too Lean")],
        },
    )
    client = ObdGatewayClient(GatewayConfig(vehicle_id="veh:x"), connection=fake)
    dtcs = client.read_dtcs()
    assert {"code": "P0304", "status": "stored", "description": "Cylinder 4 Misfire Detected"} in dtcs
    assert {"code": "P0171", "status": "pending", "description": "System Too Lean"} in dtcs


def test_read_pids_requires_connection_first():
    client = ObdGatewayClient(GatewayConfig(vehicle_id="veh:x"))
    try:
        client.read_pids(("RPM",))
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "connect()" in str(exc)
