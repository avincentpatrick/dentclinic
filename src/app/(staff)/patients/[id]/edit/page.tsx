import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updatePatient } from "@/app/actions/patients";
import { PatientForm, type PatientFormValues } from "@/components/patients/PatientForm";
import { PageHeader } from "@/components/shell/PageHeader";
import { logRead } from "@/lib/audit/log-read";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit patient" };

export default async function Page({ params }: PageProps<"/patients/[id]/edit">) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: patient } = await supabase
    .from("patients")
    .select(
      "id, patient_number, full_name, first_name, middle_name, last_name, email, dob, phone, sex, address, emergency_contact_name, emergency_contact_phone, marketing_opt_in, deleted_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!patient) notFound();

  // An edit screen is a clinical read like any other.
  await logRead("patients", patient.id, patient.id);

  const initial: PatientFormValues = {
    first_name: patient.first_name,
    middle_name: patient.middle_name ?? "",
    last_name: patient.last_name,
    email: patient.email ?? "",
    dob: patient.dob ?? "",
    phone: patient.phone ?? "",
    sex: patient.sex,
    address: patient.address ?? "",
    emergency_contact_name: patient.emergency_contact_name ?? "",
    emergency_contact_phone: patient.emergency_contact_phone ?? "",
    // Field's checkbox reads defaultChecked from `=== "on"`, matching what a
    // real checkbox submits.
    marketing_opt_in: patient.marketing_opt_in ? "on" : "",
  };

  return (
    <>
      <PageHeader
        title={`Edit ${patient.full_name ?? patient.patient_number}`}
        description={patient.patient_number}
      />
      <PatientForm
        action={updatePatient.bind(null, patient.id)}
        initial={initial}
        submitLabel="Save changes"
        cancelHref={`/patients/${patient.id}`}
      />
    </>
  );
}
