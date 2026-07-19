#!/usr/bin/env node
/**
 * Bootstraps the minimum runtime requirement for the LOGOS reasoning engine:
 * a Python (>=3.9) with the `logos` package importable, so the API can run
 * `python3 -m logos realize|reason|solve|forecast|verbalize`.
 *
 * Identical in spirit to garden-architect's scripts/setup-solver.mjs — the
 * engine is reused unmodified from the sibling `metalanguage` repo.
 *
 * Modes:
 *   node scripts/setup-solver.mjs            install + verify; FATAL on error
 *   node scripts/setup-solver.mjs --check    verify only; advise if missing; ALWAYS exit 0
 *
 * Env:
 *   LOGOS_PYTHON_BIN   python executable (default "python3")
 *   LOGOS_PIP_SPEC     pip install target when set (preferred for CI/Docker)
 *   LOGOS_ENGINE_PATH  path to the metalanguage engine dir that holds pyproject.toml
 *                      (default: ../metalanguage/engine relative to this repo)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CHECK_ONLY = process.argv.includes("--check");
const PY = process.env.LOGOS_PYTHON_BIN || "python3";
const PIP_SPEC = process.env.LOGOS_PIP_SPEC?.trim() || "";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    error: r.error,
  };
}

function done(fatalMessage) {
  if (fatalMessage && !CHECK_ONLY) {
    console.error(red(`\n✗ ${fatalMessage}`));
    process.exit(1);
  }
  if (fatalMessage) {
    console.warn(yellow(`\n⚠ ${fatalMessage}`));
    console.warn(yellow("  The reasoning engine will be unavailable until this is fixed."));
    console.warn(yellow(`  Run ${cyan("pnpm setup:solver")} once the engine is available.`));
  }
  process.exit(0);
}

console.log(
  cyan(`\nLOGOS engine setup  (mode: ${CHECK_ONLY ? "check" : "install"}, python: ${PY})`),
);

const ver = run(PY, ["-c", "import sys; print('.'.join(map(str, sys.version_info[:3])))"]);
if (!ver.ok) {
  done(`Cannot run '${PY}'. Install Python 3.9+ or set LOGOS_PYTHON_BIN.`);
}
const [maj, min] = ver.stdout.trim().split(".").map(Number);
if (maj < 3 || (maj === 3 && min < 9)) {
  done(`Python ${ver.stdout.trim()} is too old; the engine needs >= 3.9.`);
}
console.log(green(`✓ Python ${ver.stdout.trim()}`));

const already = run(PY, ["-m", "logos", "--help"]);
if (already.ok) {
  console.log(green("✓ `python3 -m logos` is available — reasoning engine ready."));
  process.exit(0);
}

if (CHECK_ONLY) {
  done("The `logos` package is not installed for this Python.");
}

if (PIP_SPEC) {
  console.log(cyan(`… installing logos from LOGOS_PIP_SPEC`));
  const install = run(PY, ["-m", "pip", "install", PIP_SPEC]);
  if (!install.ok) {
    console.error(install.stderr || install.stdout);
    done("pip install failed (see output above).");
  }
} else {
  const enginePath =
    process.env.LOGOS_ENGINE_PATH || resolve(repoRoot, "..", "metalanguage", "engine");
  if (!existsSync(resolve(enginePath, "pyproject.toml"))) {
    done(
      `LOGOS engine not found at ${enginePath} (no pyproject.toml).\n` +
        `  Set LOGOS_PIP_SPEC to a pinable install URL, or LOGOS_ENGINE_PATH to metalanguage/engine.`,
    );
  }
  console.log(cyan(`… installing logos (editable) from ${enginePath}`));
  const install = run(PY, ["-m", "pip", "install", "-e", `${enginePath}[schema]`]);
  if (!install.ok) {
    console.error(install.stderr || install.stdout);
    done("pip install failed (see output above).");
  }
}

const verify = run(PY, ["-m", "logos", "--help"]);
if (!verify.ok) {
  console.error(verify.stderr || verify.stdout);
  done("Installed, but `python3 -m logos` still fails.");
}
console.log(green("\n✓ Reasoning engine ready: `python3 -m logos` works."));
process.exit(0);
