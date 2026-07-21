#!/usr/bin/env node
/**
 * Advisory check that `@auto/logos-bridge` stays a thin re-export of
 * `@seam/logos-bridge` (software-architect). After the multiplier cutover,
 * we no longer diff a forked transport against garden — we confirm the seam
 * dependency is present and the local package body is still a shim.
 *
 * Usage:
 *   node scripts/check-bridge-drift.mjs
 *   node scripts/check-bridge-drift.mjs --quiet
 *
 * Env:
 *   SOFTWARE_ARCHITECT_PATH   explicit path to software-architect checkout
 *   SKIP_BRIDGE_DRIFT=1       skip entirely
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const QUIET = process.argv.includes("--quiet");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function log(...args) {
  if (!QUIET) console.log(...args);
}

if (process.env.SKIP_BRIDGE_DRIFT === "1") {
  console.log(cyan("bridge-drift check: skipped (SKIP_BRIDGE_DRIFT=1)"));
  process.exit(0);
}

const CANDIDATES = [
  process.env.SOFTWARE_ARCHITECT_PATH,
  resolve(repoRoot, "..", "software-architect"),
].filter(Boolean);

const seamRoot = CANDIDATES.find((p) =>
  existsSync(join(p, "packages", "logos-bridge", "package.json")),
);

log(cyan(`\nauto-architect <-> @seam/logos-bridge (software-architect) check`));

const pkgPath = join(repoRoot, "packages", "logos-bridge", "package.json");
const indexPath = join(repoRoot, "packages", "logos-bridge", "src", "index.ts");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const dep = pkg.dependencies?.["@seam/logos-bridge"];
const indexSrc = readFileSync(indexPath, "utf8");

let ok = true;

if (!dep || !String(dep).includes("software-architect/packages/logos-bridge")) {
  ok = false;
  console.log(
    yellow(
      "⚠ bridge-drift check: @auto/logos-bridge must depend on @seam/logos-bridge via software-architect path",
    ),
  );
} else {
  log(green(`  ✓ package.json depends on @seam/logos-bridge (${dep})`));
}

if (!/from ["']@seam\/logos-bridge["']/.test(indexSrc)) {
  ok = false;
  console.log(
    yellow(
      "⚠ bridge-drift check: packages/logos-bridge/src/index.ts must re-export @seam/logos-bridge",
    ),
  );
} else {
  log(green("  ✓ src/index.ts re-exports @seam/logos-bridge"));
}

const forked = ["bridge.ts", "fake.ts", "types.ts", "errors.ts", "serve-client.ts"].filter((f) =>
  existsSync(join(repoRoot, "packages", "logos-bridge", "src", f)),
);
if (forked.length) {
  ok = false;
  console.log(
    yellow(`⚠ bridge-drift check: forked transport files still present: ${forked.join(", ")}`),
  );
} else {
  log(green("  ✓ no forked transport sources under packages/logos-bridge/src"));
}

if (!seamRoot) {
  log(
    yellow(
      "⊘ software-architect checkout not found next to this repo (advisory; CI checks out the sibling)",
    ),
  );
  log(yellow(`  Tried: ${CANDIDATES.join(", ")}`));
  log(yellow("  Set SOFTWARE_ARCHITECT_PATH to verify the seam tree is present."));
} else {
  log(dim(`  seam root: ${seamRoot}`));
  log(green("  ✓ software-architect/@seam/logos-bridge is available"));
}

if (ok) {
  console.log(green("✓ bridge-drift check: @auto/logos-bridge is a seam re-export shim"));
} else {
  console.log(
    yellow(
      "⚠ bridge-drift check: shim integrity issues (advisory-only — see above; does not fail CI)",
    ),
  );
}

process.exit(0);
