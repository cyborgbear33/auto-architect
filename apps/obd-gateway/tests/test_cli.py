import json

from obd_gateway.cli import main


def test_dry_run_simulate_scan_prints_batch_with_manual_and_simulated_dtcs(capsys):
    exit_code = main(
        [
            "--vehicle-id",
            "veh:jeep-renegade-2015-latitude",
            "--dry-run",
            "--simulate",
            "--manual-pid",
            "OIL_PRESSURE_PSI=8:psi",
            "--simulate-dtc",
            "P0304:stored",
            "scan",
        ]
    )
    assert exit_code == 0
    batch = json.loads(capsys.readouterr().out)
    assert batch["vehicleId"] == "veh:jeep-renegade-2015-latitude"
    assert batch["source"] == "simulated"
    assert batch["pids"] == [{"pid": "OIL_PRESSURE_PSI", "value": 8.0, "unit": "psi", "timestamp": batch["pids"][0]["timestamp"]}]
    assert batch["dtcs"] == [{"code": "P0304", "status": "stored"}]


def test_missing_vehicle_id_exits_2(capsys):
    exit_code = main(["--dry-run", "--simulate", "scan"])
    assert exit_code == 2
    assert "AUTO_VEHICLE_ID" in capsys.readouterr().err
