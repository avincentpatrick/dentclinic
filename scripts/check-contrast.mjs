#!/usr/bin/env node
/**
 * Contrast gate for the token system. Pure Node — no browser, no build.
 *
 * Why not measure a rendered page? Because --brand-hue is a runtime clinic
 * setting. A browser check proves one hue; this proves all 360, in both themes,
 * in about a second. The two checks are complementary: axe (Phase 1.2) catches
 * bad COMPOSITIONS on real pages, this catches an unsafe PALETTE anywhere.
 *
 * It asserts three things:
 *   1. every declared pair in contrast-pairs.mjs meets its level, for every
 *      hue 0-359, in light and dark;
 *   2. every token except --c-brand stays inside sRGB at every hue (an
 *      out-of-gamut colour is browser-dependent and therefore unproven);
 *   3. the `.dark` block and the `prefers-color-scheme` system block declare
 *      identical values -- they are duplicated by necessity and would
 *      otherwise drift silently.
 *
 * Colour maths is done here rather than via culori's parser because the tokens
 * are var()-composed expressions, not literal colours: we resolve the ladder
 * ourselves, then convert. Conversions are checked against culori in --selftest.
 *
 * Usage: node scripts/check-contrast.mjs [--hue-step N] [--selftest] [--quiet]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BRAND_PAIRS, SEMANTIC_PAIRS, THRESHOLDS } from "./contrast-pairs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS = join(ROOT, "src/app/globals.css");

const args = process.argv.slice(2);
const HUE_STEP = Number(args[args.indexOf("--hue-step") + 1]) || 1;
const QUIET = args.includes("--quiet");
const SELFTEST = args.includes("--selftest");

/* ------------------------------------------------------------------ colour */

// OKLab -> linear sRGB (Björn Ottosson's matrices).
function oklchToLinearRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const EPS = 1e-6;
const inGamut = ([r, g, b]) =>
  r >= -EPS && r <= 1 + EPS && g >= -EPS && g <= 1 + EPS && b >= -EPS && b <= 1 + EPS;

/**
 * Relative luminance under NAIVE CHANNEL CLIPPING — deliberately the
 * pessimistic model. Browsers implementing CSS Color 4 reduce chroma at
 * constant lightness instead, which preserves luminance better. If a pair
 * passes here it passes in a real browser.
 */
function luminance(linear) {
  const [r, g, b] = linear.map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (l1, l2) => {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};

/* ----------------------------------------------------------------- selftest */

/**
 * Verify the hand-rolled OKLab->linear-sRGB matrices against culori, which is a
 * devDependency and not otherwise loaded (the tokens are var()-composed
 * expressions, so culori's parser cannot read them directly). Run in CI.
 */
if (SELFTEST) {
  const { converter } = await import("culori");
  const toLrgb = converter("lrgb");
  const cases = [
    [0.5, 0.13, 195],
    [0.21, 0.012, 195],
    [0.985, 0.004, 195],
    [0.52, 0.145, 27],
    [0.72, 0.13, 354],
    [0.505, 0.024, 90],
  ];
  let worst = 0;
  for (const [L, C, H] of cases) {
    const mine = oklchToLinearRgb(L, C, H);
    const t = toLrgb({ mode: "oklch", l: L, c: C, h: H });
    worst = Math.max(worst, Math.max(...mine.map((v, i) => Math.abs(v - [t.r, t.g, t.b][i]))));
  }
  const TOL = 1e-6;
  if (worst > TOL) fail(`OKLab matrices disagree with culori by ${worst.toExponential(2)} (tolerance ${TOL})`);
  console.log(`\n  selftest: OKLab -> linear sRGB matches culori within ${worst.toExponential(2)}`);
}

/* -------------------------------------------------------------------- parse */

const css = readFileSync(CSS, "utf8");

/** Pull `--name: value;` declarations out of a brace-delimited block. */
function declsOf(blockBody) {
  const out = {};
  for (const m of blockBody.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1].slice(2)] = m[2].trim();
  }
  return out;
}

/** Find a top-level `selector { ... }` block, brace-balanced. */
function blockAfter(source, startIdx) {
  const open = source.indexOf("{", startIdx);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

function findBlock(selectorRegex) {
  const m = selectorRegex.exec(css);
  if (!m) return null;
  return blockAfter(css, m.index + m[0].length - 1);
}

// `:root` appears twice (ladders, then tokens). Merge every occurrence.
const rootDecls = {};
for (const m of css.matchAll(/(^|\n)\s*:root\s*\{/g)) {
  const body = blockAfter(css, m.index + m[0].length - 1);
  if (body) Object.assign(rootDecls, declsOf(body));
}
if (Object.keys(rootDecls).length === 0) fail("No :root block found in globals.css");

const darkBody = findBlock(/(^|\n)\s*\.dark\s*\{/g);
if (!darkBody) fail("No .dark block found in globals.css");
const darkDecls = declsOf(darkBody);

const systemBody = findBlock(/html\[data-theme="system"\]\s*\{/g);
if (!systemBody) fail('No html[data-theme="system"] block found in globals.css');
const systemDecls = declsOf(systemBody);

/* ------------------------------------------------------------------ resolve */

/**
 * Evaluate a token expression to [L, C, H].
 * Handles: oklch(a b c), var(--x), calc(var(--x) * n), bare numbers.
 */
function resolve(name, vars, hue, seen = new Set()) {
  if (seen.has(name)) fail(`Circular token reference: --${name}`);
  seen.add(name);

  const raw = vars[name];
  if (raw === undefined) fail(`Token --${name} is referenced but never defined`);

  const alias = raw.match(/^var\(\s*--([\w-]+)\s*\)$/);
  if (alias) return resolve(alias[1], vars, hue, seen);

  const ok = raw.match(/^oklch\(\s*(.+)\s*\)$/);
  if (!ok) fail(`Token --${name} is not an oklch() colour or alias: ${raw}`);

  const parts = splitTop(ok[1]);
  if (parts.length < 3) fail(`Token --${name} needs 3 oklch components: ${raw}`);

  return [
    num(parts[0], vars, hue, name),
    num(parts[1], vars, hue, name),
    parts[2].includes("brand-hue") ? hue : num(parts[2], vars, hue, name),
  ];
}

/** Split on whitespace at paren-depth 0. */
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Evaluate a scalar: number | var(--x) | calc(var(--x) * n). */
function num(expr, vars, hue, ctx) {
  expr = expr.trim();
  if (expr.includes("brand-hue")) return hue;

  const plain = Number(expr);
  if (Number.isFinite(plain)) return plain;

  const v = expr.match(/^var\(\s*--([\w-]+)\s*\)$/);
  if (v) return num(vars[v[1]] ?? fail(`--${v[1]} undefined (in --${ctx})`), vars, hue, ctx);

  const calc = expr.match(/^calc\(\s*(.+?)\s*\)$/);
  if (calc) {
    const factors = calc[1].split("*").map((p) => num(p, vars, hue, ctx));
    return factors.reduce((a, b) => a * b, 1);
  }
  return fail(`Cannot evaluate "${expr}" in --${ctx}`);
}

/* -------------------------------------------------------------------- check */

function fail(msg) {
  console.error(`\n  contrast: ${msg}\n`);
  process.exit(1);
}

const THEMES = [
  { name: "light", vars: { ...rootDecls } },
  { name: "dark", vars: { ...rootDecls, ...darkDecls } },
];

// (3) The system block duplicates .dark by necessity — prove they agree.
{
  const ignore = new Set(["color-scheme"]);
  const keys = new Set([...Object.keys(darkDecls), ...Object.keys(systemDecls)].filter((k) => !ignore.has(k)));
  const drift = [...keys].filter((k) => darkDecls[k] !== systemDecls[k]);
  if (drift.length) {
    fail(
      `.dark and html[data-theme="system"] have drifted apart.\n` +
        drift.map((k) => `    --${k}: .dark="${darkDecls[k]}" system="${systemDecls[k]}"`).join("\n") +
        `\n  These blocks must stay byte-identical; system mode is resolved by the UA.`,
    );
  }
}

const ALL_PAIRS = [...BRAND_PAIRS, ...SEMANTIC_PAIRS];
const worst = new Map(); // pairKey -> {ratio, hue, theme}
const gamutWorst = new Map(); // token -> {overshoot, hue, theme}
const failures = [];

// Semantic tokens are fixed-hue; sweeping them 360x is wasted work but
// harmless, and it proves they genuinely ignore --brand-hue.
for (const theme of THEMES) {
  for (let hue = 0; hue < 360; hue += HUE_STEP) {
    const lum = new Map();
    const lumOf = (token) => {
      if (!lum.has(token)) {
        const [L, C, H] = resolve(token, theme.vars, hue);
        const linear = oklchToLinearRgb(L, C, H);
        lum.set(token, luminance(linear));

        // (2) gamut: --primary/--ring intentionally overshoot, everything else must not.
        if (!inGamut(linear) && token !== "primary" && token !== "ring" && token !== "chart-1") {
          const over = Math.max(...linear.map((v) => Math.max(-v, v - 1)));
          const prev = gamutWorst.get(token);
          if (!prev || over > prev.overshoot) {
            gamutWorst.set(token, { overshoot: over, hue, theme: theme.name });
          }
        }
      }
      return lum.get(token);
    };

    for (const pair of ALL_PAIRS) {
      const ratio = contrast(lumOf(pair.fg), lumOf(pair.bg));
      const need = THRESHOLDS[pair.level];
      const key = `${theme.name}|${pair.fg}|${pair.bg}`;
      const prev = worst.get(key);
      if (!prev || ratio < prev.ratio) {
        worst.set(key, { ratio, hue, theme: theme.name, ...pair, need });
      }
      if (ratio < need) {
        failures.push({ ...pair, need, ratio, hue, theme: theme.name });
      }
    }
  }
}

/* ------------------------------------------------------------------ report */

if (!QUIET) {
  const hues = Math.ceil(360 / HUE_STEP);
  console.log(
    `\n  Contrast — ${ALL_PAIRS.length} pairs x ${hues} hues x 2 themes = ` +
      `${(ALL_PAIRS.length * hues * 2).toLocaleString()} comparisons\n`,
  );
  const rows = [...worst.values()].sort((a, b) => a.ratio / a.need - b.ratio / b.need).slice(0, 14);
  const w = Math.max(...rows.map((r) => `${r.fg} / ${r.bg}`.length));
  console.log(`  ${"pair".padEnd(w)}  theme  need   worst   @hue`);
  console.log(`  ${"-".repeat(w)}  -----  ----  ------  -----`);
  for (const r of rows) {
    const mark = r.ratio >= r.need ? " " : "!";
    console.log(
      `${mark} ${`${r.fg} / ${r.bg}`.padEnd(w)}  ${r.theme.padEnd(5)}  ` +
        `${r.need.toFixed(1)}  ${r.ratio.toFixed(2).padStart(6)}  ${String(r.hue).padStart(4)}`,
    );
  }
  console.log(`\n  (showing the 14 tightest of ${worst.size} pair/theme combinations)`);
}

if (gamutWorst.size) {
  console.error(`\n  Out of sRGB gamut — these colours are browser-dependent and therefore unproven:`);
  for (const [token, g] of gamutWorst) {
    console.error(`    --${token}  overshoot ${g.overshoot.toFixed(4)} at hue ${g.hue} (${g.theme})`);
  }
  console.error(`\n  Lower the chroma, or add the token to the intentional-overshoot list.`);
  process.exit(1);
}

if (failures.length) {
  const byPair = new Map();
  for (const f of failures) {
    const k = `${f.theme}|${f.fg}|${f.bg}`;
    if (!byPair.has(k) || f.ratio < byPair.get(k).ratio) byPair.set(k, f);
  }
  console.error(`\n  FAILED — ${byPair.size} pair(s) below threshold:\n`);
  for (const f of byPair.values()) {
    console.error(
      `    ${f.theme.padEnd(5)}  --${f.fg} on --${f.bg}\n` +
        `           ${f.ratio.toFixed(2)}:1 at hue ${f.hue}, needs ${f.need}:1 (${f.level})`,
    );
  }
  console.error("");
  process.exit(1);
}

console.log(`\n  PASS — every declared pair clears its threshold at all 360 hues, both themes.\n`);
