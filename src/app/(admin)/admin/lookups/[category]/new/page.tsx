import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { LookupValueForm } from "@/components/lookups/LookupValueForm";
import { createLookupValue } from "@/app/actions/lookups";
import { getBranding } from "@/lib/branding";
import { getCategoryByKey } from "@/lib/lookups/read";
import { RESERVED_LOOKUP_SLUGS, slugToKey } from "@/lib/lookups/query";

export const metadata: Metadata = { title: "Add entry" };

export default async function NewLookupValuePage(
  props: PageProps<"/admin/lookups/[category]/new">,
) {
  const { category: slug } = await props.params;
  if ((RESERVED_LOOKUP_SLUGS as readonly string[]).includes(slug)) notFound();

  const category = await getCategoryByKey(slugToKey(slug));
  if (!category) notFound();

  const branding = await getBranding();

  return (
    <>
      <PageHeader
        title={`Add to ${category.label.toLowerCase()}`}
        description={category.description ?? undefined}
      />
      <LookupValueForm
        action={createLookupValue.bind(null, category.id, slug, category.value_kind)}
        initial={{ sort_order: "0" }}
        kind={category.value_kind}
        mode="create"
        currency={branding.currency}
        slug={slug}
        submitLabel="Add entry"
      />
    </>
  );
}
