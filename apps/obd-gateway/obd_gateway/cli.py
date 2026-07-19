"""
CLI entry point. Two modes, per the plan (docs/../auto-architect_car_diagnostics_app plan, Phase C):

  scan   one-shot: connect, read PIDs + DTCs, POST one Observation batch, exit.
  watch  continuous-poll mode for drives: repeat `scan`'s read+post every
         --interval seconds until Ctrl+C.

Both support `--manual-pid KEY=VALUE[:UNIT]` (repeatable) for PIDs that
aren't standard Mode 01 (OIL_PRESSURE_PSI, OIL_LEVEL_PCT — see pid_map.py),
`--dry-run` to print the batch instead of POSTing it, and `--simulate` to
skip the hardware connection entirely (only manual-pids/DTCs go in the
batch) — mirrors garden-architect's edge-gateway `simulate.ts`, useful for
demoing or testing the API against a batch shape with no adapter plugged in.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from dataclasses import replace

from .api_client import ApiClient, ApiClientError
from .batch import build_observation_batch, parse_manual_pids
from .client import ObdGatewayClient
from .config import DEFAULT_PIDS, GatewayConfig

logger = logging.getLogger("obd_gateway.cli")


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
        "--dry-run", action="store_true", help="print the batch instead of POSTing it"
    )
    parser.add_argument(
        "--simulate",
        action="store_true",
        help="skip the OBD hardware connection entirely — batch is built only from --manual-pid/DTCs",
    )
    parser.add_argument(
        "--simulate-dtc",
        action="append",
        default=[],
        metavar="CODE:STATUS",
        help="e.g. P0304:stored (repeatable, only with --simulate)",
    )
    parser.add_argument("-v", "--verbose", action="store_true")

    sub = parser.add_subparsers(dest="mode", required=True)
    sub.add_parser("scan", help="one-shot: read once, post once, exit")
    watch = sub.add_parser("watch", help="continuous-poll mode for drives")
    watch.add_argument(
        "--interval", type=float, default=None, help="seconds between polls (default from config)"
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
    if client is None:
        pid_readings: list[dict] = []
        dtcs = _parse_simulated_dtcs(args.simulate_dtc)
    else:
        pid_readings = client.read_pids(config.pids)
        dtcs = [] if args.no_dtcs else client.read_dtcs()
    batch = build_observation_batch(
        vehicle_id=config.vehicle_id,
        pid_readings=pid_readings,
        dtcs=dtcs,
        manual_pids=manual_pids,
        odometer_miles=args.odometer_miles,
        source="simulated" if client is None else "obd_gateway",
    )
    if args.dry_run or api is None:
        print(json.dumps(batch, indent=2))
    else:
        result = api.post_observation_batch(config.vehicle_id, batch)
        logger.info(
            "posted batch: %d pids, %d dtcs -> %s",
            len(batch.get("pids", [])),
            len(batch.get("dtcs", [])),
            result,
        )
    return batch


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    config = _config_from_args(args)
    try:
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
        elif args.mode == "watch":
            logger.info("watching every %.1fs — Ctrl+C to stop", config.poll_interval_seconds)
            while True:
                try:
                    run_once(config, client, api, args)
                except ApiClientError as exc:
                    logger.error("failed to post batch: %s", exc)
                time.sleep(config.poll_interval_seconds)
    except KeyboardInterrupt:
        logger.info("stopped")
    except ApiClientError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except ConnectionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    finally:
        if client is not None:
            client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
