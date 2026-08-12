import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const metadata: Metadata = { title: "Appointments" };

export default function Page() {
  return (
    <>
      <PageHeader title="Appointments" description="Your upcoming and past visits." />
      <EmptyState register="first-use" icon={CalendarClock} title="No appointments yet" description="Online booking opens in Phase 4." />
    </>
  );
}
