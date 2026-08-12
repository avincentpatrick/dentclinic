import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { AppearanceMenu } from "@/components/theme/AppearanceMenu";
import { getBranding } from "@/lib/branding";

export const metadata: Metadata = { title: "Book a visit" };

/**
 * PUBLIC guest booking. Deliberately outside the app shell — a guest has no
 * role, no tab bar, and no sidebar. The wizard lands in Phase 4.
 */
export default async function BookPage() {
  const { clinicName } = await getBranding();

  return (
    <main id="main" className="mx-auto w-full max-w-lg px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          {clinicName}
        </Link>
        <AppearanceMenu />
      </div>

      <PageHeader title="Book a visit" description="Choose a service, a time, and you're done." />

      <EmptyState
        register="first-use"
        icon={CalendarPlus}
        title="Online booking opens soon"
        description="The booking wizard arrives in Phase 4. Until then, please call the clinic."
        action={{ label: "Back to home", href: "/" }}
      />
    </main>
  );
}
