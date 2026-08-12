#!/usr/bin/env node
/**
 * The docs-with-code rule, enforced in both directions:
 *   1. every registry entry's `doc` file exists;
 *   2. every 04-components/*.md has a registry entry.
 *
 * (1) stops a component shipping undocumented. (2) stops a doc outliving the
 * component it describes — the failure mode nobody notices for six months.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const COMPONENT_DOCS = "docs/design-system/04-components";
const REGISTRY = "src/components/gallery/registry.tsx";

const source = readFileSync(REGISTRY, "utf8");
const docs = [...source.matchAll(/doc:\s*"([^"]+)"/g)].map((m) => m[1]);
const ids = [...source.matchAll(/^\s{4}id:\s*"([^"]+)"/gm)].map((m) => m[1]);

if (docs.length === 0) {
  console.error("\n  No `doc:` fields parsed from the registry — has its shape changed?\n");
  process.exit(1);
}

const problems = [];

for (const doc of docs) {
  if (!existsSync(doc)) problems.push(`registry references a missing doc:  ${doc}`);
}

const onDisk = readdirSync(COMPONENT_DOCS)
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .map((f) => join(COMPONENT_DOCS, f).replace(/\\/g, "/"));

for (const file of onDisk) {
  if (!docs.includes(file)) problems.push(`doc has no registry entry:          ${file}`);
}

if (problems.length) {
  console.error(`\n  Gallery and docs are out of sync:\n`);
  problems.forEach((p) => console.error(`    ${p}`));
  console.error(
    `\n  Every custom component needs a doc AND a /design-system entry (AGENTS.md).\n`,
  );
  process.exit(1);
}

console.log(`\n  gallery: ${ids.length} entries, ${onDisk.length} component docs, in sync.\n`);
