"""
Keep the gateway command map aligned with the thin SAE pid-dictionary seed
owned by packages/ontology. Ontology is the source of truth for units /
J1979 metadata; python-OBD command binding stays here.
"""

from __future__ import annotations

import json
from pathlib import Path

from obd_gateway.config import DEFAULT_PIDS
from obd_gateway.pid_map import MANUAL_ONLY_PIDS, STANDARD_PID_COMMANDS

REPO_ROOT = Path(__file__).resolve().parents[3]
PID_DICTIONARY_PATH = REPO_ROOT / "packages" / "ontology" / "pid-dictionary.json"


def _load_pid_seed() -> dict[str, dict]:
    data = json.loads(PID_DICTIONARY_PATH.read_text(encoding="utf-8"))
    assert "pids" in data
    return data["pids"]


def test_pid_dictionary_seed_file_exists():
    assert PID_DICTIONARY_PATH.is_file(), PID_DICTIONARY_PATH


def test_seed_mode01_pids_are_in_standard_commands():
    for key, entry in _load_pid_seed().items():
        if entry.get("manualOnly"):
            continue
        assert key in STANDARD_PID_COMMANDS, (
            f"seed Mode 01 PID {key} missing from STANDARD_PID_COMMANDS"
        )


def test_standard_commands_have_seed_metadata():
    """S7 gate: every gateway-bound Mode 01 key has ontology units/hex."""
    seed = _load_pid_seed()
    for key in STANDARD_PID_COMMANDS:
        assert key in seed, f"STANDARD_PID_COMMANDS {key} missing from pid-dictionary.json"
        entry = seed[key]
        assert entry.get("unit"), key
        assert entry.get("mode") == "01", key
        assert entry.get("pidHex"), key
        assert entry.get("sae") is True, key


def test_seed_manual_pids_are_in_manual_only():
    for key, entry in _load_pid_seed().items():
        if not entry.get("manualOnly"):
            continue
        assert key in MANUAL_ONLY_PIDS, f"seed manual PID {key} missing from MANUAL_ONLY_PIDS"
        assert key not in STANDARD_PID_COMMANDS


def test_default_poll_pids_are_in_seed_with_units():
    seed = _load_pid_seed()
    for key in DEFAULT_PIDS:
        assert key in seed, f"DEFAULT_PIDS entry {key} missing from pid-dictionary.json"
        assert seed[key].get("unit"), key


def test_every_seed_row_has_a_unit():
    for key, entry in _load_pid_seed().items():
        assert entry.get("unit"), key
