import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { AppointmentTypeForm } from "@/components/lookups/AppointmentTypeForm";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { updateAppointmentType } from "@/app/actions/lookups";
import { createClient } from "@/lib/supabase/server";
import { totalBlockMinutes } from "@/lib/lookups/format";

export const metadata: Metadata = { title: "Edit appointment type" };

/** A row id that is not a uuid is a 404, not a database error. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditAppointmentTypePage(
  props: PageProps<"/admin/lookups/appointment-types/[id]">,
) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("appointment_types")
    .select(
      "id, name, description, duration_units, pre_buffer_units, post_buffer_units, patient_bookable, color, sort_order, deleted_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  return (
    <>
      <PageHeader
        title={data.name}
        description={`Booked as ${data.duration_units * 10} minutes; occupies ${totalBlockMinutes(data)} minutes of a chair.`}
      />

      {data.deleted_at && (
        <InlineAlert tone="warning" title="This type is archived">
          <p>
            It is hidden from booking. Restore it from the list to offer it again — existing
            appointments are unaffected either way.
          </p>
        </InlineAlert>
      )}

      <AppointmentTypeForm
        action={updateAppointmentType.bind(null, id)}
        initial={{
          name: data.name,
          description: data.description ?? "",
          // Units out of the database, minutes into the form. The validator is
          // the only thing that converts the other way.
          duration_minutes: String(data.duration_units * 10),
          pre_buffer_minutes: String(data.pre_buffer_units * 10),
          post_buffer_minutes: String(data.post_buffer_units * 10),
          patient_bookable: data.patient_bookable ? "on" : "",
          color: data.color,
          sort_order: String(data.sort_order),
        }}
        submitLabel="Save changes"
      />
    </>
  );
}
