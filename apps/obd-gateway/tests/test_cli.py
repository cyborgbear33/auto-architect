import json

from obd_gateway.api_client import ApiClientError
from obd_gateway.cli import (
    EMPTY_POLL_RECONNECT_THRESHOLD,
    _batch_is_empty,
    _build_parser,
    _config_from_args,
    _run_watch_loop,
    main,
)


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


def test_bad_baudrate_env_var_exits_cleanly_instead_of_a_raw_traceback(monkeypatch, capsys):
    monkeypatch.setenv("AUTO_OBD_BAUDRATE", "not-a-number")
    exit_code = main(["--vehicle-id", "veh:x", "--dry-run", "--simulate", "scan"])
    assert exit_code == 2
    assert "AUTO_OBD_BAUDRATE" in capsys.readouterr().err


def test_batch_is_empty_true_only_when_nothing_was_read():
    assert _batch_is_empty({"vehicleId": "v", "capturedAt": "t", "source": "s"}) is True
    assert _batch_is_empty({"pids": [{"pid": "RPM", "value": 850.0}]}) is False
    assert _batch_is_empty({"dtcs": [{"code": "P0304", "status": "stored"}]}) is False
    assert _batch_is_empty({"freezeFrames": [{"dtc": "P0304", "readings": []}]}) is False
    assert _batch_is_empty({"mode06": [{"mid": "21"}]}) is False
    assert _batch_is_empty({"imStatus": {"mil": False}}) is False


class FakeWatchClient:
    """Duck-types exactly the ObdGatewayClient surface `_run_watch_loop` and
    `run_once` touch — is_connected/reconnect for link health, read_* for
    poll data — without going anywhere near python-OBD. `pid_plan` entries
    are consumed one per `read_pids()` call: a list of readings, or an
    Exception instance to raise instead (simulating e.g. a decoder crash)."""

    def __init__(self, *, connected: bool = True, pid_plan=None, reconnect_results=None):
        self.connected = connected
        self.pid_plan = list(pid_plan or [])
        self.reconnect_results = list(reconnect_results or [])
        self.reconnect_calls = 0

    def is_connected(self):
        return self.connected

    def reconnect(self):
        self.reconnect_calls += 1
        result = self.reconnect_results.pop(0) if self.reconnect_results else True
        self.connected = result
        return result

    def read_pids(self, pid_keys):  # noqa: ARG002 — mirrors ObdGatewayClient signature
        action = self.pid_plan.pop(0) if self.pid_plan else []
        if isinstance(action, Exception):
            raise action
        return action

    def read_dtcs(self):
        return []

    def read_freeze_frames(self):
        return []

    def read_mode06(self):
        return []

    def read_im_status(self):
        return None


class FakeApi:
    def __init__(self, *, raise_error: bool = False):
        self.posted: list[dict] = []
        self.raise_error = raise_error

    def post_observation_batch(self, vehicle_id, batch):  # noqa: ARG002
        if self.raise_error:
            raise ApiClientError("API unreachable")
        self.posted.append(batch)
        return {}


def _watch_args():
    return _build_parser().parse_args(["--vehicle-id", "veh:x", "watch"])


def test_watch_loop_skips_posting_and_backs_off_while_link_is_down_then_resumes():
    args = _watch_args()
    config = _config_from_args(args)
    client = FakeWatchClient(
        connected=False,
        reconnect_results=[False, False, True],
        pid_plan=[[{"pid": "RPM", "value": 850.0, "unit": "rpm", "timestamp": "t"}]],
    )
    api = FakeApi()
    sleeps: list[float] = []

    _run_watch_loop(config, client, api, args, max_iterations=3, sleep_fn=sleeps.append)

    assert client.reconnect_calls == 3
    # two failed reconnects back off (10s, 20s at the default 5s interval),
    # the third succeeds and the loop falls through to a normal poll + sleep.
    assert sleeps == [10.0, 20.0, config.poll_interval_seconds]
    assert len(api.posted) == 1
    assert api.posted[0]["pids"][0]["pid"] == "RPM"


def test_watch_loop_forces_a_reconnect_after_consecutive_empty_polls():
    healthy = [{"pid": "RPM", "value": 850.0, "unit": "rpm", "timestamp": "t"}]
    args = _watch_args()
    config = _config_from_args(args)
    client = FakeWatchClient(
        connected=True,
        pid_plan=[[] for _ in range(EMPTY_POLL_RECONNECT_THRESHOLD)] + [healthy],
    )
    api = FakeApi()

    _run_watch_loop(
        config,
        client,
        api,
        args,
        max_iterations=EMPTY_POLL_RECONNECT_THRESHOLD + 1,
        sleep_fn=lambda _: None,
    )

    # is_connected() never lied — the reconnect only fires because of the
    # empty-poll streak, proving that heuristic (not just is_connected()) works.
    assert client.reconnect_calls == 1
    assert len(api.posted) == EMPTY_POLL_RECONNECT_THRESHOLD + 1
    assert api.posted[-1]["pids"][0]["pid"] == "RPM"


def test_watch_loop_survives_a_read_exception_without_crashing_or_reconnecting():
    healthy1 = [{"pid": "RPM", "value": 850.0, "unit": "rpm", "timestamp": "t"}]
    healthy2 = [{"pid": "RPM", "value": 900.0, "unit": "rpm", "timestamp": "t"}]
    args = _watch_args()
    config = _config_from_args(args)
    client = FakeWatchClient(
        connected=True,
        pid_plan=[healthy1, RuntimeError("decoder blew up on a malformed frame"), healthy2],
    )
    api = FakeApi()

    _run_watch_loop(config, client, api, args, max_iterations=3, sleep_fn=lambda _: None)

    # a bad cycle is not treated as a link failure — no reconnect attempt.
    assert client.reconnect_calls == 0
    assert len(api.posted) == 2  # iterations 1 and 3; iteration 2 raised before posting


def test_watch_loop_continues_after_an_api_post_failure_without_touching_link_health():
    healthy = [{"pid": "RPM", "value": 850.0, "unit": "rpm", "timestamp": "t"}]
    args = _watch_args()
    config = _config_from_args(args)
    client = FakeWatchClient(connected=True, pid_plan=[healthy, healthy, healthy])
    api = FakeApi(raise_error=True)

    _run_watch_loop(config, client, api, args, max_iterations=3, sleep_fn=lambda _: None)

    assert client.reconnect_calls == 0
    assert api.posted == []


def test_watch_loop_healthy_regression():
    healthy = [{"pid": "RPM", "value": 850.0, "unit": "rpm", "timestamp": "t"}]
    args = _watch_args()
    config = _config_from_args(args)
    client = FakeWatchClient(connected=True, pid_plan=[healthy, healthy, healthy])
    api = FakeApi()
    sleeps: list[float] = []

    _run_watch_loop(config, client, api, args, max_iterations=3, sleep_fn=sleeps.append)

    assert client.reconnect_calls == 0
    assert len(api.posted) == 3
    assert sleeps == [config.poll_interval_seconds] * 3
