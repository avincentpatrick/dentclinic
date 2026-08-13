import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CLINIC_NAME } from "@/lib/settings/branding-schema";

/**
 * Shared reads for the lookups screens.
 *
 * The join rule lives here rather than in each call site: a value is live only
 * if BOTH it and its category are live. Soft delete never cascades
 * (05-patterns/soft-delete.md), so an archived category would otherwise leave
 * its values reachable — and categories cannot be archived at all
 * (`lookup_categories_guard`), which makes this belt-and-braces rather than
 * load-bearing today. It becomes load-bearing the moment that guard is relaxed.
 */

export type LookupCategory = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  value_kind: "label" | "money";
  sort_order: number;
};

export async function getCategories(): Promise<LookupCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lookup_categories")
    .select("id, key, label, description, value_kind, sort_order")
    .is("deleted_at", null)
    .order("sort_order")
    .order("label");
  return (data ?? []) as LookupCategory[];
}

export async function getCategoryByKey(key: string): Promise<LookupCategory | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lookup_categories")
    .select("id, key, label, description, value_kind, sort_order")
    .eq("key", key)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as LookupCategory | null) ?? null;
}

/**
 * Live counts per list, for the hub.
 *
 * One query for all lookup values and two head counts, tallied in JS: at clinic
 * scale this is tens of rows, and a per-category count query would be four more
 * round trips for a number on a card. When that stops being true it becomes a
 * view or an RPC — this comment is the trigger.
 */
export async function getLookupCounts(): Promise<{
  appointmentTypes: number;
  operatories: number;
  byCategoryId: Record<string, number>;
}> {
  const supabase = await createClient();

  const [types, ops, values] = await Promise.all([
    supabase
      .from("appointment_types")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase.from("operatories").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("lookup_values").select("category_id").is("deleted_at", null),
  ]);

  const byCategoryId: Record<string, number> = {};
  for (const row of values.data ?? []) {
    byCategoryId[row.category_id] = (byCategoryId[row.category_id] ?? 0) + 1;
  }

  return {
    appointmentTypes: types.count ?? 0,
    operatories: ops.count ?? 0,
    byCategoryId,
  };
}

export const CLINIC_FALLBACK_NAME = DEFAULT_CLINIC_NAME;
