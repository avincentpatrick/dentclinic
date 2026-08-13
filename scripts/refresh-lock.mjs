#!/usr/bin/env node
/**
 * Regenerate package-lock.json inside the same Linux image CI uses.
 *
 * WHY THIS EXISTS. npm resolves platform-specific optional dependencies for the
 * platform it is running on and prunes the rest, so a lock generated on Windows
 * is missing every `@next/swc-linux-*`, `@tailwindcss/oxide-linux-*` and
 * `@img/sharp-linux-*` binary that `npm ci` on an ubuntu runner demands. The
 * result is a CI failure at install time, before a single gate executes — which
 * is exactly what happened in Phase 2 the first time Actions were able to run:
 * the lock had ONE variant of each family where CI needed eight to twenty-four.
 *
 * Generating in a container makes the lock a function of the pinned image
 * rather than of whoever last ran `npm install`, so it is reproducible by
 * anyone on any OS.
 *
 * WHEN TO RUN IT: after adding, removing or upgrading any dependency. Running
 * plain `npm install` on Windows or macOS will re-prune the lock and break CI
 * again, so treat that as a local-only side effect and refresh before pushing.
 *
 * SAFE BY CONSTRUCTION: `--package-lock-only` means npm never writes
 * node_modules, so the bind mount cannot overwrite the host's platform binaries
 * with Linux ones. Do not drop that flag — a bare `npm ci` in this container
 * would leave the working copy unrunnable on the host.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Keep in step with .github/workflows/*.yml `node-version`.
const IMAGE = "node:24-bookworm";
const cwd = process.cwd();

const probe = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" });
if (probe.status !== 0) {
  console.error(
    "\n  Docker is not available, and the lock must be generated on Linux to match CI.\n" +
      "  Start Docker Desktop and re-run, or run this in any Linux environment:\n" +
      "    rm -f package-lock.json && npm install --package-lock-only\n",
  );
  process.exit(1);
}

console.log(`\n  Regenerating package-lock.json in ${IMAGE} …\n`);

const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "-v",
    `${cwd}:/w`,
    "-w",
    "/w",
    IMAGE,
    "sh",
    "-c",
    // --package-lock-only: never touch node_modules. See the note above.
    "rm -f package-lock.json && npm install --package-lock-only --no-audit --no-fund",
  ],
  { stdio: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
);

if (result.status !== 0) process.exit(result.status ?? 1);

// A lock that resolved only the host platform is the failure this script exists
// to prevent, so prove it did not happen rather than assuming.
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const families = {};
for (const key of Object.keys(lock.packages)) {
  const m = key.match(/node_modules\/(@[^/]+\/[^/]*?)-(darwin|linux|win32|freebsd|android)-/);
  if (m) families[m[1]] = (families[m[1]] ?? 0) + 1;
}

const thin = Object.entries(families).filter(([, n]) => n < 3);
if (thin.length) {
  console.error(
    `\n  Lock looks platform-pruned — these families have fewer than 3 variants:\n` +
      thin.map(([f, n]) => `    ${f}: ${n}`).join("\n") +
      `\n\n  CI will fail at npm ci. Did this run outside the container?\n`,
  );
  process.exit(1);
}

console.log(
  `\n  lock: ${Object.keys(lock.packages).length} packages, ` +
    `${Object.keys(families).length} multi-platform families all covered.\n`,
);
