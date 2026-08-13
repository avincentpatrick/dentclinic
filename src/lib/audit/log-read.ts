import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Record a clinical READ in `private.audit_log`.
 *
 * Writes need nothing — the `patients_audit` trigger captures every INSERT and
 * UPDATE with full before/after JSON. Reads have no trigger to hang off, so
 * AGENTS.md's "audit every clinical read and write" only holds if the page
 * asks. `public.log_read` has existed since 0002 with zero call sites; these
 * are the first.
 *
 * Called AFTER the row is confirmed readable, never before: `log_read` is
 * `security definer` and takes caller-supplied ids with no ownership check, so
 * calling it early would record a read of a record RLS then refused to return.
 *
 * Failures are swallowed. An audit write that fails must not take a clinical
 * screen down with it; the alternative is staff who cannot see a chart because
 * of a logging problem.
 */
export async function logRead(
  entity: string,
  entityId: string | null = null,
  patientId: string | null = null,
): Promise<void> {
  // A PREFETCH IS NOT A READ.
  //
  // Without Cache Components, Next does not render a dynamic page's body during
  // prefetch at all (node_modules/next/dist/docs/01-app/02-guides/prefetching.md
  // — "a dynamic route is skipped unless it has a loading.js boundary"), so this
  // guard is currently belt-and-braces. It stays because that is FRAMEWORK
  // BEHAVIOUR, not an API contract: a future `loading.tsx`, Partial Prefetching,
  // or Cache Components could each start rendering ahead of a click.
  //
  // The failure mode is the one that must not happen. `private.audit_log` is
  // append-only, exempt from purge, and exists to answer "who looked at this
  // patient" — filling it with reads nobody performed makes it worse than
  // useless, because it would be confidently wrong in a dispute.
  try {
    const h = await headers();
    if (h.get("next-router-prefetch") === "1" || h.get("purpose") === "prefetch") return;
  } catch {
    // No request scope (shouldn't happen from a page) — fall through and log.
  }

  try {
    const supabase = await createClient();
    await supabase.rpc("log_read", {
      p_entity: entity,
      p_entity_id: entityId ?? undefined,
      p_patient_id: patientId ?? undefined,
    });
  } catch {
    // Never block a render on the audit write.
  }
}
