import { AppShell } from "@/components/shell/AppShell";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/roles";

/**
 * Routes every signed-in role can reach (`/profile`, `/feedback`).
 *
 * Route groups don't affect URLs, so this exists purely to give those pages the
 * RIGHT shell. `/profile` previously lived under `(patient)`, whose layout
 * hardcodes `role="patient"` — so a superadmin opening their own profile got
 * patient bottom tabs and lost the Administration group, on a route that
 * ROUTE_RULES has always granted to ALL_ROLES. Same reasoning as the `(staff)`
 * layout: when a group serves more than one role, the role comes from the claim.
 *
 * The `?? "patient"` fallback is the least-privileged shell, which is the safe
 * default if the claim is somehow absent — middleware has already established
 * that a session exists before any of these pages render.
 */
export default async function SharedLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const role = (data?.claims?.user_role as AppRole | undefined) ?? "patient";

  return <AppShell role={role}>{children}</AppShell>;
}
