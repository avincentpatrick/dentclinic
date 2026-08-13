/**
 * The declared contrast contract for the token system.
 *
 * This file is a DESIGN ARTIFACT, not test scaffolding: it is the list of
 * foreground/background pairs the UI is allowed to compose, and the level each
 * must meet. Adding a token without adding its pair here means it is unproven.
 *
 * Levels (WCAG 2.2 AA):
 *   text  4.5  body text
 *   large 3.0  >=24px, or >=18.66px bold
 *   ui    3.0  non-text: control borders, focus rings (SC 1.4.11)
 *
 * Consumed by scripts/check-contrast.mjs. Documented in docs/design-system/01-tokens.md.
 */

/** Brand-derived pairs. Swept across all 360 hues, both themes. */
export const BRAND_PAIRS = [
  { fg: "foreground", bg: "background", level: "text" },
  { fg: "foreground", bg: "card", level: "text" },
  { fg: "foreground", bg: "muted", level: "text" },
  { fg: "muted-foreground", bg: "background", level: "text" },
  { fg: "muted-foreground", bg: "muted", level: "text" },
  // The toast surface. --popover aliases --card, whose foreground pair is
  // already swept, but an unlisted token is an unproven token (07-contributing
  // step 5) and this one now carries an Undo control.
  { fg: "popover-foreground", bg: "popover", level: "text" },
  { fg: "secondary-foreground", bg: "secondary", level: "text" },
  { fg: "primary-foreground", bg: "primary", level: "text" },
  { fg: "sidebar-foreground", bg: "sidebar", level: "text" },
  { fg: "sidebar-accent-foreground", bg: "sidebar-accent", level: "text" },
  // Non-text boundaries. --border is decorative and deliberately excluded:
  // it draws dividers, never a control edge. --input is the control boundary.
  { fg: "input", bg: "background", level: "ui" },
  { fg: "input", bg: "card", level: "ui" },
  { fg: "ring", bg: "background", level: "ui" },
  { fg: "ring", bg: "muted", level: "ui" },
];

/** The 13 fixed-hue semantic tokens. Hue is constant, so these are checked once. */
export const SEMANTIC_TOKENS = [
  "status-scheduled",
  "status-confirmed",
  "status-in-chair",
  "status-completed",
  "status-no-show",
  "status-cancelled",
  "clinical-healthy",
  "clinical-watch",
  "clinical-urgent",
  "success",
  "warning",
  "info",
  "destructive",
];

/**
 * Every semantic token must satisfy all three:
 *   on-soft / soft        chip text on chip background        4.5
 *   on-solid / solid      label on a filled badge/button      4.5
 *   solid / background    the dot/icon/border against canvas  3.0
 */
export const SEMANTIC_PAIRS = SEMANTIC_TOKENS.flatMap((t) => [
  { fg: `${t}-on-soft`, bg: `${t}-soft`, level: "text" },
  { fg: "on-solid", bg: t, level: "text" },
  { fg: t, bg: "background", level: "ui" },
]);

export const THRESHOLDS = { text: 4.5, large: 3.0, ui: 3.0 };
