import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { LookupValueForm } from "@/components/lookups/LookupValueForm";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { updateLookupValue } from "@/app/actions/lookups";
import { getBranding } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { getCategoryByKey } from "@/lib/lookups/read";
import { RESERVED_LOOKUP_SLUGS, slugToKey } from "@/lib/lookups/query";
import type { LookupValueField } from "@/lib/lookups/schema";

export const metadata: Metadata = { title: "Edit entry" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditLookupValuePage(
  props: PageProps<"/admin/lookups/[category]/[id]">,
) {
  const { category: slug, id } = await props.params;
  if ((RESERVED_LOOKUP_SLUGS as readonly string[]).includes(slug) || !UUID_RE.test(id)) notFound();

  const category = await getCategoryByKey(slugToKey(slug));
  if (!category) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("lookup_values")
    .select("id, label, code, amount, sort_order, is_system, deleted_at, category_id")
    .eq("id", id)
    .maybeSingle();

  // Belt and braces: a value id from one category must not render under another
  // category's slug, or the form would submit against the wrong `value_kind`.
  if (!data || data.category_id !== category.id) notFound();

  const branding = await getBranding();

  return (
    <>
      <PageHeader title={data.label} description={category.label} />

      {data.is_system && (
        <InlineAlert tone="info" title="This is a built-in entry">
          <p>
            The app reads it by name, so it can be renamed and reordered but not archived, and its
            code is fixed.
          </p>
        </InlineAlert>
      )}

      {data.deleted_at && (
        <InlineAlert tone="warning" title="This entry is archived">
          <p>It is no longer offered. Restore it from the list to use it again.</p>
        </InlineAlert>
      )}

      <LookupValueForm
        action={updateLookupValue.bind(null, id, slug, category.value_kind)}
        initial={{
          label: data.label,
          code: data.code ?? "",
          amount: data.amount === null ? "" : String(data.amount),
          sort_order: String(data.sort_order),
        }}
        kind={category.value_kind}
        mode="edit"
        currency={branding.currency}
        isSystem={data.is_system}
        slug={slug}
        submitLabel="Save changes"
      />
    </>
  );
}
