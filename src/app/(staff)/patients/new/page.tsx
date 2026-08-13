import type { Metadata } from "next";
import { createPatient } from "@/app/actions/patients";
import { PatientForm } from "@/components/patients/PatientForm";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Add patient" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Add patient"
        description="A walk-in record. The patient can claim it later by signing in with this email address."
      />
      <PatientForm action={createPatient} submitLabel="Create patient" cancelHref="/patients" />
    </>
  );
}
