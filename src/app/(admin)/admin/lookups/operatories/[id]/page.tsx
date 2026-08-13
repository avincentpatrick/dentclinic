import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { OperatoryForm } from "@/components/lookups/OperatoryForm";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { updateOperatory } from "@/app/actions/lookups";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit treatment room" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditOperatoryPage(props: PageProps<"/admin/lookups/operatories/[id]">) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const [row, providerList] = await Promise.all([
    supabase
      .from("operatories")
      .select("id, name, sort_order, is_hygiene, default_provider_id, deleted_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("providers")
      .select("id, display_name")
      .is("deleted_at", null)
      .order("sort_order")
      .order("display_name"),
  ]);

  const data = row.data;
  if (!data) notFound();

  const providers = (providerList.data ?? []).map((p) => ({ value: p.id, label: p.display_name }));

  return (
    <>
      <PageHeader title={data.name} description="A chair the clinic books into." />

      {data.deleted_at && (
        <InlineAlert tone="warning" title="This room is archived">
          <p>
            The calendar no longer offers it. Restore it from the list — its past appointments are
            unaffected either way.
          </p>
        </InlineAlert>
      )}

      <OperatoryForm
        action={updateOperatory.bind(null, id)}
        initial={{
          name: data.name,
          sort_order: String(data.sort_order),
          is_hygiene: data.is_hygiene ? "on" : "",
          default_provider_id: data.default_provider_id ?? "",
        }}
        providers={providers}
        submitLabel="Save changes"
      />
    </>
  );
}
