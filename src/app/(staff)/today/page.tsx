import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Today" description="The day's schedule and patient queue." />
      <EmptyState
        register="cleared"
        icon={CalendarClock}
        title="Nothing booked today"
        description="The timeline, queue board and day stats arrive in Phases 3 and 8."
      />
    </>
  );
}
