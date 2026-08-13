import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/roles";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who is calling, resolved from the JWT — the one thing a Server Action is
 * allowed to authorize on.
 *
 * AGENTS.md is blunt about why this exists: middleware gates NAVIGATION. A
 * Server Action is a POST of an action id to whatever path the browser happens
 * to be on, so a staff user sitting on /today can invoke a superadmin action's
 * id and middleware never sees an /admin request at all. "This action is only
 * imported by an admin page" is not a check.
 *
 * Note what is NOT here: `x-role`. Middleware builds that header from
 * `request.headers`, which a client controls. It is presentation input for the
 * font step and nothing else, ever.
 *
 * This returns a value rather than throwing so an action can answer with an
 * ActionState the form can render. Callers that have nothing to render (the
 * void archive/restore actions) throw at their own call site instead.
 */

export type Actor = {
  supabase: SupabaseClient<Database>;
  role: AppRole;
  userId: string;
};

const STAFF_SIDE: readonly AppRole[] = ["staff", "doctor", "superadmin"] as const;

export function isStaffSide(role: AppRole): boolean {
  return STAFF_SIDE.includes(role);
}

/** The signed-in caller, or null if there is no usable session. */
export async function getActor(): Promise<Actor | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  const role = data?.claims?.user_role as AppRole | undefined;
  const userId = data?.claims?.sub as string | undefined;
  if (!role || !userId) return null;

  return { supabase, role, userId };
}

/**
 * The caller, but only if they are staff-side. `null` covers both "signed out"
 * and "signed in as a patient" on purpose — the difference is not something a
 * caller should branch on, and collapsing it keeps the two from drifting.
 *
 * RLS enforces the same rule underneath. This is the layer that produces a
 * sentence a human can read instead of an empty result set.
 */
export async function getStaffActor(): Promise<Actor | null> {
  const actor = await getActor();
  return actor && isStaffSide(actor.role) ? actor : null;
}
