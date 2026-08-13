import type { Metadata } from "next";
import Link from "next/link";
import { CalendarHeart } from "lucide-react";
import { hasPatientRecord } from "@/app/actions/patients";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Home" };

export default async function PatientHome({ searchParams }: PageProps<"/home">) {
  const sp = await searchParams;

  // One RLS-scoped read, here rather than in middleware: a DB query on every
  // patient request to decide whether to show a CTA is not a trade worth making.
  const registered = await hasPatientRecord();

  return (
    <>
      <PageHeader title="Welcome" description="Your next visit and quick actions." />

      <div className="mt-4 flex flex-col gap-4">
        {sp.registered === "1" && (
          <InlineAlert tone="success" title="You're registered">
            {/* Deliberately identical whether claim_or_create_patient linked an
                existing clinic record or created a new one. The patient learns
                nothing either way — that is the enumeration guarantee. */}
            <p>Thanks — the clinic has your details. You can book a visit whenever you like.</p>
          </InlineAlert>
        )}

        {!registered && (
          <InlineAlert tone="info" title="Complete your registration">
            <p>The clinic needs a few details before your first visit.</p>
            <p className="mt-3">
              <Button asChild className="min-h-11">
                <Link href="/register">Complete registration</Link>
              </Button>
            </p>
          </InlineAlert>
        )}

        <EmptyState
          register="first-use"
          icon={CalendarHeart}
          title="No upcoming visit"
          description="Your next appointment will show here. Booking opens in Phase 4."
          action={{ label: "Book a visit", href: "/book" }}
        />
      </div>
    </>
  );
}
