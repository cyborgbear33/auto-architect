import pytest

from obd_gateway.batch import build_observation_batch, parse_manual_pids


def test_parse_manual_pids_with_unit():
    result = parse_manual_pids(["OIL_PRESSURE_PSI=8:psi"])
    assert len(result) == 1
    assert result[0]["pid"] == "OIL_PRESSURE_PSI"
    assert result[0]["value"] == 8.0
    assert result[0]["unit"] == "psi"
    assert result[0]["timestamp"]


def test_parse_manual_pids_without_unit():
    result = parse_manual_pids(["OIL_LEVEL_PCT=42"])
    assert result[0]["unit"] is None


def test_parse_manual_pids_rejects_malformed_pair():
    with pytest.raises(ValueError, match="KEY=VALUE"):
        parse_manual_pids(["not-a-pair"])


def test_parse_manual_pids_rejects_non_numeric_value():
    with pytest.raises(ValueError, match="numeric"):
        parse_manual_pids(["OIL_PRESSURE_PSI=low"])


def test_build_observation_batch_never_synthesizes_missing_data():
    batch = build_observation_batch(vehicle_id="veh:jeep-renegade-2015-latitude")
    assert batch["vehicleId"] == "veh:jeep-renegade-2015-latitude"
    assert batch["source"] == "obd_gateway"
    assert "dtcs" not in batch
    assert "pids" not in batch


def test_build_observation_batch_merges_pid_readings_and_manual_pids():
    batch = build_observation_batch(
        vehicle_id="veh:x",
        pid_readings=[{"pid": "ENGINE_LOAD", "value": 82.0, "unit": "%", "timestamp": "t"}],
        manual_pids=[{"pid": "OIL_PRESSURE_PSI", "value": 8.0, "unit": "psi", "timestamp": "t"}],
        dtcs=[{"code": "P0304", "status": "stored", "description": None}],
        odometer_miles=54321.0,
    )
    pids_by_key = {p["pid"]: p for p in batch["pids"]}
    assert set(pids_by_key) == {"ENGINE_LOAD", "OIL_PRESSURE_PSI"}
    assert batch["dtcs"] == [{"code": "P0304", "status": "stored"}]  # None description dropped
    assert batch["odometerMiles"] == 54321.0
