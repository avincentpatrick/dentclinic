import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { AppointmentTypeForm } from "@/components/lookups/AppointmentTypeForm";
import { createAppointmentType } from "@/app/actions/lookups";

export const metadata: Metadata = { title: "Add appointment type" };

export default function NewAppointmentTypePage() {
  return (
    <>
      <PageHeader
        title="Add appointment type"
        description="Durations are in 10-minute steps, because the scheduler works on a 10-minute grid."
      />
      <AppointmentTypeForm
        action={createAppointmentType}
        initial={{
          patient_bookable: "on",
          color: "teal",
          pre_buffer_minutes: "0",
          post_buffer_minutes: "0",
          sort_order: "0",
        }}
        submitLabel="Add type"
      />
    </>
  );
}
