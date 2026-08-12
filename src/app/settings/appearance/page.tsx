import type { Metadata } from "next";
import Link from "next/link";
import { AppearancePanel } from "@/components/theme/AppearancePanel";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Appearance",
};

/**
 * Canonical appearance screen. Public by design (see PUBLIC_PATHS in
 * middleware): it holds no PHI, and a guest partway through booking must be
 * able to enlarge the text without an account.
 */
export default async function AppearanceSettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <h1 className="text-2xl font-semibold text-foreground">Appearance</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose how DentClinic looks on this device.
      </p>

      <div className="mt-8">
        <AppearancePanel variant="page" signedIn={signedIn} />
      </div>

      <Link
        href="/"
        className="mt-8 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Back
      </Link>
    </main>
  );
}
