#!/usr/bin/env node
/**
 * The Cloudflare free tier caps a Worker at 3 MB gzipped. Phase 1.2 is where
 * the dependency count starts growing and Phase 3 brings FullCalendar, so this
 * prints the number on every build and fails before the limit, not at it.
 */
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";

const HANDLER = ".open-next/server-functions/default/handler.mjs";
const WARN_MB = 2.4;
const FAIL_MB = 2.9;

if (!existsSync(HANDLER)) {
  console.error(`\n  ${HANDLER} not found — run \`opennextjs-cloudflare build\` first.\n`);
  process.exit(1);
}

const gz = gzipSync(readFileSync(HANDLER)).length;
const mb = gz / 1024 / 1024;
const pct = ((mb / 3) * 100).toFixed(1);

console.log(`\n  worker: ${mb.toFixed(2)} MB gzipped (${pct}% of the 3 MB limit)\n`);

if (mb > FAIL_MB) {
  console.error(`  FAILED — over ${FAIL_MB} MB. Dynamic-import the heaviest deps.\n`);
  process.exit(1);
}
if (mb > WARN_MB) {
  console.warn(`  WARNING — over ${WARN_MB} MB. Check what was just added.\n`);
}
