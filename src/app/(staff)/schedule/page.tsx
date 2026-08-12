import type { Metadata } from "next";
import { Calendar } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const metadata: Metadata = { title: "Schedule" };

export default function Page() {
  return (
    <>
      <PageHeader title="Schedule" description="Clinic calendar across providers and chairs." />
      <EmptyState register="first-use" icon={Calendar} title="No schedule yet" description="The week calendar and drag-to-reschedule land in Phase 3." />
    </>
  );
}
