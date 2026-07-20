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
    fake = FakeConnection(
        supported={obd.commands.ENGINE_LOAD}, responses={obd.commands.ENGINE_LOAD: quantity}
    )
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
    assert {
        "code": "P0304",
        "status": "stored",
        "description": "Cylinder 4 Misfire Detected",
    } in dtcs
    assert {"code": "P0171", "status": "pending", "description": "System Too Lean"} in dtcs


def test_read_pids_requires_connection_first():
    client = ObdGatewayClient(GatewayConfig(vehicle_id="veh:x"))
    try:
        client.read_pids(("RPM",))
        raise AssertionError("expected RuntimeError")
    except RuntimeError as exc:
        assert "connect()" in str(exc)


class FakeMonitorTest:
    def __init__(self, tid, value, min_v, max_v):
        self.tid = tid
        self.value = value
        self.min = min_v
        self.max = max_v

    def is_null(self):
        return self.tid is None or self.value is None or self.min is None or self.max is None

    @property
    def passed(self):
        if self.is_null():
            return False
        return self.min <= self.value <= self.max


class FakeMonitor:
    def __init__(self, tests):
        self._tests = tests

    @property
    def tests(self):
        return [t for t in self._tests if not t.is_null()]


def test_read_freeze_frames_returns_dtc_and_mode02_pids():
    ureg = obd.Unit
    fake = FakeConnection(
        supported={
            obd.commands.DTC_FREEZE_DTC,
            obd.commands.DTC_ENGINE_LOAD,
            obd.commands.DTC_RPM,
        },
        responses={
            obd.commands.DTC_FREEZE_DTC: ("P0304", "Cylinder 4 Misfire Detected"),
            obd.commands.DTC_ENGINE_LOAD: 85.0 * ureg.percent,
            obd.commands.DTC_RPM: 2100.0 * ureg.rpm,
        },
    )
    client = ObdGatewayClient(GatewayConfig(vehicle_id="veh:x"), connection=fake)
    frames = client.read_freeze_frames()
    assert len(frames) == 1
    assert frames[0]["dtc"] == "P0304"
    by_pid = {r["pid"]: r for r in frames[0]["readings"]}
    assert by_pid["ENGINE_LOAD"]["value"] == 85.0
    assert by_pid["RPM"]["value"] == 2100.0


def test_read_freeze_frames_omits_when_no_freeze_dtc():
    fake = FakeConnection(supported={obd.commands.DTC_FREEZE_DTC}, responses={})
    client = ObdGatewayClient(GatewayConfig(vehicle_id="veh:x"), connection=fake)
    assert client.read_freeze_frames() == []


def test_discover_capabilities_partitions_mode01_and_mode06():
    fake = FakeConnection(
        supported={
            obd.commands.RPM,
            obd.commands.ENGINE_LOAD,
            obd.commands.DTC_FREEZE_DTC,
            obd.commands.GET_CURRENT_DTC,
            obd.commands.MONITOR_CATALYST_B1,
            obd.commands.VIN,
        },
        responses={},
    )
    fake.protocol_id = lambda: "6"
    fake.protocol_name = lambda: "ISO 15765-4"
    fake.port_name = "/dev/rfcomm0"
    client = ObdGatewayClient(GatewayConfig(vehicle_id="veh:x"), connection=fake)
    report = client.discover_capabilities(vehicle_id="veh:jeep-renegade-2015-latitude")
    assert report["vehicleId"] == "veh:jeep-renegade-2015-latitude"
    assert report["source"] == "obd_gateway"
    assert report["connection"]["connected"] is True
    assert report["connection"]["protocolName"] == "ISO 15765-4"
    assert "RPM" in report["modes"]["mode01"]["supported"]
    assert "ENGINE_LOAD" in report["modes"]["mode01"]["supported"]
    assert "SPEED" in report["modes"]["mode01"]["unsupported"]
    assert "21" in report["modes"]["mode06"]["supportedMids"]
    assert report["modes"]["mode02FreezeFrame"]["supported"] is True
    assert report["modes"]["mode07Pending"]["supported"] is True
    assert report["modes"]["vin"]["supported"] is True
    assert "OIL_PRESSURE_PSI" in report["manualOnlyPids"]


def test_read_mode06_maps_mid_tid_and_pass_fail():
    monitor = FakeMonitor(
        [
            FakeMonitorTest(tid=1, value=0.8, min_v=0.0, max_v=0.5),
            FakeMonitorTest(tid=None, value=1.0, min_v=0.0, max_v=1.0),  # null → skipped
        ]
    )
    fake = FakeConnection(
        supported={obd.commands.MONITOR_CATALYST_B1},
        responses={obd.commands.MONITOR_CATALYST_B1: monitor},
    )
    client = ObdGatewayClient(GatewayConfig(vehicle_id="veh:x"), connection=fake)
    rows = client.read_mode06()
    assert len(rows) == 1
    assert rows[0] == {
        "tid": "01",
        "mid": "21",
        "value": 0.8,
        "min": 0.0,
        "max": 0.5,
        "passed": False,
    }
