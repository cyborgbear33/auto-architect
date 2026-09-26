"""
CLI entry point:

  scan      one-shot: connect, read PIDs + DTCs (+ FF/Mode06), POST one batch, exit.
  watch     continuous-poll mode for drives.
  discover  probe ECU/adapter support (no value dump); POST capability report.

Both support `--manual-pid KEY=VALUE[:UNIT]` (repeatable) for PIDs that
aren't standard Mode 01 (OIL_PRESSURE_PSI, OIL_LEVEL_PCT — see pid_map.py),
`--dry-run` to print the batch instead of POSTing it, and `--simulate` to
skip the hardware connection entirely (manual-pids/DTCs/Mode 06/FF go in the
batch) — mirrors garden-architect's edge-gateway `simulate.ts`, useful for
demoing or testing the API against a batch shape with no adapter plugged in.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from collections.abc import Callable
from dataclasses import replace

from .api_client import ApiClient, ApiClientError
from .batch import build_observation_batch, parse_manual_pids, parse_simulated_mode06
from .client import ObdGatewayClient
from .config import DEFAULT_PIDS, GatewayConfig
from .discovery import build_simulated_capability_report
from .im_status import simulated_im_status

logger = logging.getLogger("obd_gateway.cli")

# How many consecutive fully-empty poll cycles in `watch` mode before we
# suspect the link is silently dead and force a reconnect, even though
# `client.is_connected()` still reports true. Some Bluetooth/rfcomm stacks
# never surface a disconnect as an exception or a status flip (see
# client.py's `is_connected()` docstring) — a real, connected ECU almost
# always answers *something* every cycle (RPM alone is enough), so several
# fully empty cycles in a row is a strong, low-false-positive signal.
EMPTY_POLL_RECONNECT_THRESHOLD = 6
MAX_RECONNECT_BACKOFF_SECONDS = 30.0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="obd-gateway", description="auto-architect OBD-II edge gateway"
    )
    parser.add_argument(
        "--vehicle-id", help="vehicle profile id, e.g. veh:jeep-renegade-2015-latitude"
    )
    parser.add_argument("--api-base-url", help="API base URL (default http://localhost:4100)")
    parser.add_argument(
        "--port", dest="obd_port", help="serial/BT device path for the adapter, e.g. /dev/rfcomm0"
    )
    parser.add_argument("--baudrate", dest="obd_baudrate", type=int)
    parser.add_argument(
        "--protocol", dest="obd_protocol", help="force an OBD protocol id instead of auto-detect"
    )
    parser.add_argument(
        "--pids",
        help=f"comma-separated PID keys to poll (default: {','.join(DEFAULT_PIDS)})",
    )
    parser.add_argument(
        "--manual-pid",
        action="append",
        default=[],
        metavar="KEY=VALUE[:UNIT]",
        help="inject a reading the adapter can't provide, e.g. --manual-pid OIL_PRESSURE_PSI=8:psi (repeatable)",
    )
    parser.add_argument("--odometer-miles", type=float, default=None)
    parser.add_argument("--no-dtcs", action="store_true", help="skip reading DTCs this cycle")
    parser.add_argument(
        "--no-freeze-frame",
        action="store_true",
        help="skip Mode 02 freeze-frame read this cycle",
    )
    parser.add_argument(
        "--no-mode06",
        action="store_true",
        help="skip Mode 06 on-board monitor read this cycle",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="print the batch instead of POSTing it"
    )
    parser.add_argument(
        "--simulate",
        action="store_true",
        help="skip the OBD hardware connection entirely — batch is built only from simulate/manual flags",
    )
    parser.add_argument(
        "--simulate-dtc",
        action="append",
        default=[],
        metavar="CODE:STATUS",
        help="e.g. P0304:stored (repeatable, only with --simulate)",
    )
    parser.add_argument(
        "--simulate-freeze-frame",
        default=None,
        metavar="DTC",
        help="with --simulate: attach a freeze frame for DTC using --manual-pid readings as the snapshot",
    )
    parser.add_argument(
        "--simulate-mode06",
        action="append",
        default=[],
        metavar="MID:TID:VALUE:MIN:MAX[:pass|fail]",
        help="e.g. 21:01:0.8:0:0.5:fail (repeatable, only with --simulate)",
    )
    parser.add_argument(
        "--no-im-status",
        action="store_true",
        help="skip Mode 01 PID $01 STATUS / I/M readiness this cycle",
    )
    parser.add_argument("-v", "--verbose", action="store_true")

    sub = parser.add_subparsers(dest="mode", required=True)
    sub.add_parser("scan", help="one-shot: read once, post once, exit")
    watch = sub.add_parser("watch", help="continuous-poll mode for drives")
    watch.add_argument(
        "--interval", type=float, default=None, help="seconds between polls (default from config)"
    )
    sub.add_parser(
        "discover",
        help="probe Mode 01/02/03/06/07/VIN support (no value dump); POST discovery report",
    )
    return parser


def _config_from_args(args: argparse.Namespace) -> GatewayConfig:
    config = GatewayConfig()
    overrides: dict[str, object] = {}
    if args.vehicle_id:
        overrides["vehicle_id"] = args.vehicle_id
    if args.api_base_url:
        overrides["api_base_url"] = args.api_base_url
    if args.obd_port:
        overrides["obd_port"] = args.obd_port
    if args.obd_baudrate:
        overrides["obd_baudrate"] = args.obd_baudrate
    if args.obd_protocol:
        overrides["obd_protocol"] = args.obd_protocol
    if args.pids:
        overrides["pids"] = tuple(p.strip().upper() for p in args.pids.split(",") if p.strip())
    if getattr(args, "interval", None):
        overrides["poll_interval_seconds"] = args.interval
    return replace(config, **overrides) if overrides else config


def _parse_simulated_dtcs(pairs: list[str]) -> list[dict[str, str]]:
    dtcs = []
    for pair in pairs:
        code, _, status = pair.partition(":")
        dtcs.append({"code": code.strip().upper(), "status": (status.strip().lower() or "stored")})
    return dtcs


def run_once(
    config: GatewayConfig,
    client: ObdGatewayClient | None,
    api: ApiClient | None,
    args: argparse.Namespace,
) -> dict:
    manual_pids = parse_manual_pids(args.manual_pid)
    freeze_frames: list[dict] = []
    mode06: list[dict] = []
    im_status: dict | None = None
    if client is None:
        pid_readings: list[dict] = []
        dtcs = _parse_simulated_dtcs(args.simulate_dtc)
        mode06 = parse_simulated_mode06(args.simulate_mode06)
        if args.simulate_freeze_frame:
            freeze_frames = [
                {
                    "dtc": str(args.simulate_freeze_frame).strip().upper(),
                    "readings": list(manual_pids),
                }
            ]
        if not args.no_im_status:
            # Software path: incomplete EVAP/catalyst — not a smog-ready invent.
            im_status = simulated_im_status(incomplete_evap=True)
    else:
        pid_readings = client.read_pids(config.pids)
        dtcs = [] if args.no_dtcs else client.read_dtcs()
        if not args.no_freeze_frame:
            freeze_frames = client.read_freeze_frames()
        if not args.no_mode06:
            mode06 = client.read_mode06()
        if not args.no_im_status:
            im_status = client.read_im_status()
    batch = build_observation_batch(
        vehicle_id=config.vehicle_id,
        pid_readings=pid_readings,
        dtcs=dtcs,
        manual_pids=manual_pids,
        freeze_frames=freeze_frames,
        mode06=mode06,
        im_status=im_status,
        odometer_miles=args.odometer_miles,
        source="simulated" if client is None else "obd_gateway",
    )
    if args.dry_run or api is None:
        print(json.dumps(batch, indent=2))
    else:
        result = api.post_observation_batch(config.vehicle_id, batch)
        logger.info(
            "posted batch: %d pids, %d dtcs, %d freezeFrames, %d mode06 -> %s",
            len(batch.get("pids", [])),
            len(batch.get("dtcs", [])),
            len(batch.get("freezeFrames", [])),
            len(batch.get("mode06", [])),
            result,
        )
    return batch


def run_discover(
    config: GatewayConfig,
    client: ObdGatewayClient | None,
    api: ApiClient | None,
    args: argparse.Namespace,
) -> dict:
    if client is None:
        report = build_simulated_capability_report(vehicle_id=config.vehicle_id)
    else:
        report = client.discover_capabilities(vehicle_id=config.vehicle_id)
    if args.dry_run or api is None:
        print(json.dumps(report, indent=2))
    else:
        result = api.post_discovery_report(config.vehicle_id, report)
        mode01 = report["modes"]["mode01"]
        mode06 = report["modes"]["mode06"]
        logger.info(
            "posted discovery: mode01 %d supported / %d unsupported / %d unknown; "
            "mode06 %d supported MIDs -> %s",
            len(mode01.get("supported", [])),
            len(mode01.get("unsupported", [])),
            len(mode01.get("unknown", [])),
            len(mode06.get("supportedMids", [])),
            result,
        )
    return report


def _batch_is_empty(batch: dict) -> bool:
    """True only when a poll cycle produced no evidence at all. `watch` mode
    always attempts PID reads (config.pids defaults non-empty, and the
    --no-* flags only skip dtcs/freeze-frame/mode06/im-status), so a fully
    empty batch from real hardware is a strong signal the *link*, not the
    vehicle, has gone quiet — a healthy-but-boring cycle (RPM=0, no DTCs)
    still populates `pids` and is never mistaken for a dead link."""
    return not (
        batch.get("pids")
        or batch.get("dtcs")
        or batch.get("freezeFrames")
        or batch.get("mode06")
        or batch.get("imStatus")
    )


def _run_watch_loop(
    config: GatewayConfig,
    client: ObdGatewayClient | None,
    api: ApiClient | None,
    args: argparse.Namespace,
    *,
    max_iterations: int | None = None,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> None:
    """Continuous-poll loop for an unattended drive session. Must survive,
    not just report, three real hardware failure modes:

    1. The link cleanly reports itself down (`client.is_connected()` is
       False) — attempt a reconnect with capped exponential backoff instead
       of posting hollow batches while dead.
    2. The link silently goes quiet without ever reporting itself down (a
       known python-OBD/pyserial gap on some Bluetooth/rfcomm stacks) —
       caught via the consecutive-empty-poll heuristic above instead.
    3. A single cycle raises (e.g. a decoder choking on a malformed frame) —
       caught per cycle so one bad read doesn't end the whole drive's
       logging.

    `max_iterations` / `sleep_fn` exist only so tests can drive this
    deterministically without a real infinite loop or real sleeps; production
    callers never pass them.
    """
    logger.info("watching every %.1fs — Ctrl+C to stop", config.poll_interval_seconds)
    consecutive_failures = 0
    consecutive_empty_polls = 0
    was_link_down = False
    iterations = 0

    while max_iterations is None or iterations < max_iterations:
        iterations += 1

        if client is not None:
            link_down = not client.is_connected()
            suspected_dead = consecutive_empty_polls >= EMPTY_POLL_RECONNECT_THRESHOLD
            if link_down or suspected_dead:
                if not was_link_down:
                    logger.error(
                        "OBD adapter link %s — attempting reconnect",
                        "reports disconnected"
                        if link_down
                        else f"produced {consecutive_empty_polls} empty polls in a row (suspected dead)",
                    )
                    was_link_down = True
                if client.reconnect():
                    logger.info("OBD adapter link restored")
                    was_link_down = False
                    consecutive_failures = 0
                    consecutive_empty_polls = 0
                else:
                    consecutive_failures += 1
                    backoff = min(
                        config.poll_interval_seconds * (2 ** min(consecutive_failures, 5)),
                        MAX_RECONNECT_BACKOFF_SECONDS,
                    )
                    logger.warning("reconnect failed — retrying in %.1fs", backoff)
                    sleep_fn(backoff)
                    continue

        try:
            batch = run_once(config, client, api, args)
        except ApiClientError as exc:
            logger.error("failed to post batch: %s", exc)
        except Exception:  # noqa: BLE001 — one bad cycle must not end the drive session
            logger.exception("poll cycle failed unexpectedly — continuing")
            consecutive_failures += 1
        else:
            consecutive_failures = 0
            consecutive_empty_polls = consecutive_empty_polls + 1 if _batch_is_empty(batch) else 0

        sleep_fn(config.poll_interval_seconds)


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    try:
        config = _config_from_args(args)
        config.require_vehicle_id()
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    api = None if args.dry_run else ApiClient(config.api_base_url, config.request_timeout_seconds)
    client = None if args.simulate else ObdGatewayClient(config)

    try:
        if client is not None:
            client.connect()
        if args.mode == "scan":
            run_once(config, client, api, args)
        elif args.mode == "discover":
            run_discover(config, client, api, args)
        elif args.mode == "watch":
            _run_watch_loop(config, client, api, args)
    except KeyboardInterrupt:
        logger.info("stopped")
    except ApiClientError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except ConnectionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 — fail cleanly for the operator; full trace still in the log
        logger.exception("unexpected error")
        print(
            f"error: unexpected failure — {exc} (see log for details; rerun with -v for more)",
            file=sys.stderr,
        )
        return 1
    finally:
        if client is not None:
            client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
