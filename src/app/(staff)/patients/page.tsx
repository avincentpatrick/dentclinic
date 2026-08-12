import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const metadata: Metadata = { title: "Patients" };

export default function Page() {
  return (
    <>
      <PageHeader title="Patients" description="The clinic patient roster." />
      <EmptyState register="first-use" icon={Users} title="No patients yet" description="The patient registry lands in Phase 2." />
    </>
  );
}
