import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { OperatoryForm } from "@/components/lookups/OperatoryForm";
import { createOperatory } from "@/app/actions/lookups";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add treatment room" };

export default async function NewOperatoryPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("providers")
    .select("id, display_name")
    .is("deleted_at", null)
    .order("sort_order")
    .order("display_name");

  const providers = (data ?? []).map((p) => ({ value: p.id, label: p.display_name }));

  return (
    <>
      <PageHeader title="Add treatment room" description="A chair the clinic books into." />
      <OperatoryForm
        action={createOperatory}
        initial={{ sort_order: "0" }}
        providers={providers}
        submitLabel="Add room"
      />
    </>
  );
}
