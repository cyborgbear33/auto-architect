#!/usr/bin/env node
/**
 * Ensures the shared repo-root .venv exists (Python >=3.10, prefers 3.12),
 * then installs obd-gateway runtime + dev deps (pytest, ruff) into it.
 *
 * Usage: pnpm obd-gateway:install
 *
 * Env:
 *   LOGOS_PYTHON_BIN   python used to create the venv when missing
 *                      (default: first of python3.12, python3.13, python3.11,
 *                      python3.10, python3 on PATH that is >=3.10)
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const venvDir = resolve(repoRoot, ".venv");
const venvPython = resolve(venvDir, "bin", "python3");
const venvPip = resolve(venvDir, "bin", "pip");
const requirements = resolve(repoRoot, "apps/obd-gateway/requirements-dev.txt");
/** requests>=2.33 and ruff target-version=py312 need modern CPython. */
const MIN_PY = { major: 3, minor: 10 };

const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    cwd: repoRoot,
    stdio: opts.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  return {
    ok: r.status === 0,
    status: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    error: r.error,
  };
}

function pythonVersion(bin) {
  const r = run(bin, [
    "-c",
    "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}')",
  ]);
  if (!r.ok) return null;
  const [major, minor, patch] = r.stdout.trim().split(".").map(Number);
  return { major, minor, patch, text: r.stdout.trim() };
}

function isNewEnough(v) {
  return v && (v.major > MIN_PY.major || (v.major === MIN_PY.major && v.minor >= MIN_PY.minor));
}

function resolveBootstrapPython() {
  if (process.env.LOGOS_PYTHON_BIN?.trim()) {
    return process.env.LOGOS_PYTHON_BIN.trim();
  }
  const candidates = ["python3.12", "python3.13", "python3.11", "python3.10", "python3"];
  for (const bin of candidates) {
    const v = pythonVersion(bin);
    if (isNewEnough(v)) return bin;
  }
  return null;
}

console.log(cyan("\nobd-gateway install"));

const bootstrap = resolveBootstrapPython();
if (!bootstrap) {
  console.error(
    red(
      `\n✗ Need Python >=${MIN_PY.major}.${MIN_PY.minor} on PATH (or set LOGOS_PYTHON_BIN).\n` +
        `  macOS tip: brew install python@3.12`,
    ),
  );
  process.exit(1);
}

const bootstrapVer = pythonVersion(bootstrap);
console.log(cyan(`  bootstrap python: ${bootstrap} (${bootstrapVer.text})`));

let needCreate = !existsSync(venvPython);
if (!needCreate) {
  const existing = pythonVersion(venvPython);
  if (!isNewEnough(existing)) {
    console.log(
      yellow(
        `… existing .venv is Python ${existing?.text ?? "unknown"}; recreating with ${bootstrapVer.text}`,
      ),
    );
    rmSync(venvDir, { recursive: true, force: true });
    needCreate = true;
  } else {
    console.log(green(`✓ .venv already present (Python ${existing.text})`));
  }
}

if (needCreate) {
  console.log(cyan(`… creating shared .venv at ${venvDir}`));
  const created = run(bootstrap, ["-m", "venv", venvDir], { inherit: true });
  if (!created.ok) {
    console.error(red(`\n✗ Failed to create .venv with '${bootstrap}'.`));
    process.exit(created.status);
  }
  console.log(green("✓ .venv created"));
}

if (!existsSync(venvPip)) {
  console.error(red(`\n✗ Expected pip at ${venvPip} after venv create.`));
  process.exit(1);
}

// Older venvs (esp. from macOS system Python) ship a pip too old for current pins.
console.log(cyan("… upgrading pip in .venv"));
const pipUpgrade = run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"], {
  inherit: true,
});
if (!pipUpgrade.ok) {
  console.error(red("\n✗ pip upgrade failed (see output above)."));
  process.exit(pipUpgrade.status);
}

console.log(cyan("… pip install -r apps/obd-gateway/requirements-dev.txt"));
const install = run(venvPip, ["install", "-r", requirements], { inherit: true });
if (!install.ok) {
  console.error(red("\n✗ pip install failed (see output above)."));
  process.exit(install.status);
}

console.log(green("\n✓ obd-gateway deps installed into .venv"));
