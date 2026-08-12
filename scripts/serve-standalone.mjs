#!/usr/bin/env node
/**
 * Serve the production build for the a11y run.
 *
 * `next start` is NOT an option: OpenNext sets `output: "standalone"`, and
 * next start refuses to run with it. The standalone server is a byproduct of
 * the build we already do, so this costs no extra build — it just needs the
 * static assets copied next to it, which Next deliberately leaves to the host.
 *
 * Node rather than `wrangler dev`: axe asserts on DOM and ARIA, which are
 * byte-identical between Node and workerd. workerd would add startup latency
 * and .dev.vars plumbing for zero extra signal.
 */
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const STANDALONE = ".next/standalone";
const PORT = process.env.PORT ?? "3100";

if (!existsSync(`${STANDALONE}/server.js`)) {
  console.error(`\n  ${STANDALONE}/server.js not found — run a build first.\n`);
  process.exit(1);
}

cpSync(".next/static", `${STANDALONE}/.next/static`, { recursive: true });
if (existsSync("public")) cpSync("public", `${STANDALONE}/public`, { recursive: true });

const child = spawn(process.execPath, [`${STANDALONE}/server.js`], {
  stdio: "inherit",
  env: { ...process.env, PORT, HOSTNAME: "127.0.0.1" },
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill(sig);
    process.exit(0);
  });
}
child.on("exit", (code) => process.exit(code ?? 0));
