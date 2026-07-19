from obd_gateway.pid_map import MANUAL_ONLY_PIDS, STANDARD_PID_COMMANDS, resolve_pid_keys


def test_standard_pids_resolve():
    supported, unsupported = resolve_pid_keys(("RPM", "ENGINE_LOAD", "SPEED"))
    assert supported == ["RPM", "ENGINE_LOAD", "SPEED"]
    assert unsupported == []


def test_manual_only_pids_are_flagged_unsupported():
    supported, unsupported = resolve_pid_keys(("ENGINE_LOAD", "OIL_PRESSURE_PSI"))
    assert supported == ["ENGINE_LOAD"]
    assert unsupported == ["OIL_PRESSURE_PSI"]


def test_manual_only_pids_documented_and_not_double_listed():
    # every manual-only PID must have a reason string, and must NOT also be
    # claimed as a standard PID (that would silently shadow the manual path).
    for key in MANUAL_ONLY_PIDS:
        assert key not in STANDARD_PID_COMMANDS
        assert MANUAL_ONLY_PIDS[key]


def test_every_cartridge_pid_key_is_resolvable_one_way_or_the_other():
    # Mirrors the exact PID keys real cartridges reference today
    # (packages/cartridges/src/*.ts) — if a cartridge author adds a new PID
    # key, this test should start failing until pid_map.py is updated.
    cartridge_pid_keys = {
        "ENGINE_LOAD",
        "LONG_FUEL_TRIM_1",
        "LONG_FUEL_TRIM_2",
        "OIL_PRESSURE_PSI",
    }
    for key in cartridge_pid_keys:
        assert key in STANDARD_PID_COMMANDS or key in MANUAL_ONLY_PIDS, key
