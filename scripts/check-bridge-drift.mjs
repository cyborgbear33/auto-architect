#!/usr/bin/env node
import { spawnSync } from "node:child_process";
/**
 * Advisory-only check that `packages/logos-bridge`'s domain-agnostic seam
 * files (`bridge.ts`, `serve-client.ts`, `errors.ts`, `types.ts`) haven't
 * silently drifted from garden-architect's `@garden/logos-bridge` twin. The two
 * packages share one wire contract/transport by design (see
 * `docs/AI_HANDOFF.md` §2) — a fix or engine-protocol change made on one
 * side and forgotten on the other is exactly the kind of bug this project's
 * "propose/dispose" discipline is supposed to prevent.
 *
 * This is NOT a hard gate:
 *   - The sibling repo may not be checked out next to this one (CI never has
 *     it) — the check skips cleanly rather than failing.
 *   - Some divergence is expected and fine (different domain types, feature
 *     work landing on one side first). This script flags structural drift
 *     for a human to read, it does not judge whether the drift is a bug.
 *
 * Usage:
 *   node scripts/check-bridge-drift.mjs          human-readable report, always exit 0
 *   node scripts/check-bridge-drift.mjs --quiet  summary line only
 *
 * Env:
 *   GARDEN_ARCHITECT_PATH   explicit path to the garden-architect checkout
 *                           (the directory containing its own package.json)
 *   SKIP_BRIDGE_DRIFT=1     skip entirely (e.g. on a machine without the sibling)
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

// This machine's layout nests the checkout one level deeper
// (Projects/garden-architect/garden-architect); a flatter sibling checkout
// (Projects/garden-architect) is also accepted. First match wins.
const CANDIDATES = [
  process.env.GARDEN_ARCHITECT_PATH,
  resolve(repoRoot, "..", "garden-architect", "garden-architect"),
  resolve(repoRoot, "..", "garden-architect"),
].filter(Boolean);

const gardenRoot = CANDIDATES.find((p) =>
  existsSync(join(p, "packages", "logos-bridge", "package.json")),
);

if (!gardenRoot) {
  console.log(
    yellow(
      "⊘ bridge-drift check: garden-architect checkout not found next to this repo (advisory-only, skipped)",
    ),
  );
  log(yellow("  Tried: " + CANDIDATES.join(", ")));
  log(yellow("  Set GARDEN_ARCHITECT_PATH to compare."));
  process.exit(0);
}

/**
 * Strip comments and collapse whitespace, then neutralize the domain
 * substitutions we KNOW are intentional (result type name, package scope,
 * a couple of vehicle/garden-flavored words in comments) so only real
 * structural drift shows up as a difference.
 */
function normalize(src) {
  return (
    src
      .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
      .replace(/\/\/.*$/gm, " ") // line comments
      .replace(/DiagnosticSolution|GardenSolution/g, "__SOLUTION_TYPE__")
      .replace(/@auto\/semantic-types|@garden\/semantic-types/g, "__SEMANTIC_TYPES__")
      .replace(/@auto\/game-theory|@garden\/game-theory/g, "__GAME_THEORY__")
      .replace(/@auto\/logos-bridge|@garden\/logos-bridge/g, "__PKG_NAME__")
      .replace(/multi-vehicle|multi-bed/gi, "__DOMAIN_ADJ__")
      .replace(/plantParent:\s*"(?:Plant|Engine)"/g, 'plantParent: "__PLANT_PARENT__"')
      .replace(
        /plant_parent === "string" \? r\.plant_parent : "(?:Plant|Engine)"/g,
        'plant_parent === "string" ? r.plant_parent : "__PLANT_PARENT__"',
      )
      // Trailing commas + Prettier wrap spaces are formatting-only.
      .replace(/,(\s*[)\]}])/g, "$1")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .replace(/\{\s+/g, "{")
      .replace(/\s+\}/g, "}")
      .replace(/,\s+/g, ",")
      .replace(/;\s+/g, ";")
      .replace(/:\s+/g, ":")
      .replace(/\s+\./g, ".")
      // Prettier sometimes wraps ternaries (incl. `Number(...)`) in map callbacks.
      .replace(
        /\((typeof\b(?:[^()]|\([^()]*\))*\?(?:[^()]|\([^()]*\))*:(?:[^()]|\([^()]*\))*)\)/g,
        "$1",
      )
      .replace(/\s+/g, " ")
      .trim()
  );
}

const SEAM_FILES = ["bridge.ts", "serve-client.ts", "errors.ts", "types.ts"];

log(cyan(`\nauto-architect <-> garden-architect logos-bridge drift check`));
log(dim(`  comparing against: ${gardenRoot}`));

let anyDrift = false;
for (const file of SEAM_FILES) {
  const autoPath = join(repoRoot, "packages", "logos-bridge", "src", file);
  const gardenPath = join(gardenRoot, "packages", "logos-bridge", "src", file);
  if (!existsSync(autoPath) || !existsSync(gardenPath)) {
    log(yellow(`  ? ${file}: missing on one side, skipped`));
    continue;
  }
  const autoSrc = readFileSync(autoPath, "utf8");
  const gardenSrc = readFileSync(gardenPath, "utf8");
  if (normalize(autoSrc) === normalize(gardenSrc)) {
    log(green(`  ✓ ${file}: in sync (modulo comments/formatting/known domain substitutions)`));
    continue;
  }
  anyDrift = true;
  log(yellow(`  ⚠ ${file}: structural drift detected`));
  if (!QUIET) {
    const diff = spawnSync("diff", ["-u", autoPath, gardenPath], { encoding: "utf8" });
    const lines = (diff.stdout || "").split("\n").slice(0, 20);
    for (const l of lines) console.log(dim(`      ${l}`));
    if ((diff.stdout || "").split("\n").length > 20) console.log(dim("      … (truncated)"));
  }
}

if (anyDrift) {
  log(
    yellow(
      "\n⚠ Some seam files differ structurally from garden-architect's copy. Read the diff above: " +
        "port a real fix/feature both ways, or note here why the divergence is intentional. " +
        "This never fails CI — it is a reminder, not a gate.",
    ),
  );
  console.log(
    yellow(
      "⚠ bridge-drift check: structural drift detected (advisory-only, see above for details)",
    ),
  );
} else {
  log(green("\n✓ logos-bridge seam files are in sync with garden-architect."));
  console.log(green("✓ bridge-drift check: in sync with garden-architect"));
}

process.exit(0);
