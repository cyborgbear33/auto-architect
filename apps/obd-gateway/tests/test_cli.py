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
    assert batch["pids"] == [
        {
            "pid": "OIL_PRESSURE_PSI",
            "value": 8.0,
            "unit": "psi",
            "timestamp": batch["pids"][0]["timestamp"],
        }
    ]
    assert batch["dtcs"] == [{"code": "P0304", "status": "stored"}]


def test_missing_vehicle_id_exits_2(capsys):
    exit_code = main(["--dry-run", "--simulate", "scan"])
    assert exit_code == 2
    assert "AUTO_VEHICLE_ID" in capsys.readouterr().err


def test_dry_run_simulate_discover_prints_unknown_catalog(capsys):
    exit_code = main(
        [
            "--vehicle-id",
            "veh:jeep-renegade-2015-latitude",
            "--dry-run",
            "--simulate",
            "discover",
        ]
    )
    assert exit_code == 0
    report = json.loads(capsys.readouterr().out)
    assert report["source"] == "simulated"
    assert report["connection"]["connected"] is False
    assert "RPM" in report["modes"]["mode01"]["unknown"]
    assert "21" in report["modes"]["mode06"]["unknownMids"]
    assert report["modes"]["mode01"]["supported"] == []


def test_dry_run_simulate_includes_freeze_frame_and_mode06(capsys):
    exit_code = main(
        [
            "--vehicle-id",
            "veh:silverado-2500hd-2003",
            "--dry-run",
            "--simulate",
            "--manual-pid",
            "ENGINE_LOAD=85:%",
            "--simulate-dtc",
            "P0304:stored",
            "--simulate-freeze-frame",
            "P0304",
            "--simulate-mode06",
            "21:01:0.8:0:0.5:fail",
            "scan",
        ]
    )
    assert exit_code == 0
    batch = json.loads(capsys.readouterr().out)
    assert batch["freezeFrames"][0]["dtc"] == "P0304"
    assert batch["freezeFrames"][0]["readings"][0]["pid"] == "ENGINE_LOAD"
    assert batch["mode06"][0]["mid"] == "21"
    assert batch["mode06"][0]["passed"] is False
