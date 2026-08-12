import type { AppRole } from "@/lib/roles";

/**
 * Shell configuration with no React and no icons — safe to import anywhere,
 * including middleware. (`nav.ts` imports lucide components and must NOT be
 * pulled into the edge bundle.)
 */

/** "expanded" | "collapsed" — read server-side, written by the client toggle. */
export const SIDEBAR_COOKIE = "dc_sidebar";
export const SIDEBAR_MAX_AGE = 60 * 60 * 24 * 365;

export const SIDEBAR_WIDTH = "16rem"; // 256px
export const SIDEBAR_RAIL_WIDTH = "3.5rem"; // 56px

/**
 * Idle timeout per role. Staff-side is 15 minutes because a clinic workstation
 * sits in a public-facing room; patients get 30 on their own device.
 *
 * Note this guard — not the JWT — is the real session control: supabase-js
 * auto-refreshes the token in the background regardless of user activity, so a
 * tab left open never expires on its own. See docs/modules/01-auth-roles.md.
 */
export const IDLE_MS: Record<AppRole, number> = {
  patient: 30 * 60_000,
  staff: 15 * 60_000,
  doctor: 15 * 60_000,
  superadmin: 15 * 60_000,
};

/** How long the warning dialog is shown before sign-out. */
export const IDLE_WARN_MS = 60_000;
