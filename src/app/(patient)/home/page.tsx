import type { Metadata } from "next";
import { CalendarHeart } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const metadata: Metadata = { title: "Home" };

export default function PatientHome() {
  return (
    <>
      <PageHeader title="Welcome" description="Your next visit and quick actions." />
      <EmptyState
        register="first-use"
        icon={CalendarHeart}
        title="No upcoming visit"
        description="Your next appointment will show here. Booking opens in Phase 4."
        action={{ label: "Book a visit", href: "/book" }}
      />
    </>
  );
}
