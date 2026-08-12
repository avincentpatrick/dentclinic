import Link from "next/link";
import { AppearanceMenu } from "@/components/theme/AppearanceMenu";
import { getBranding } from "@/lib/branding";

export default async function Landing() {
  const { clinicName, tagline } = await getBranding();

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="absolute right-4 top-4">
        <AppearanceMenu />
      </div>
      <h1 className="text-3xl font-bold text-foreground">{clinicName}</h1>
      <p className="max-w-md text-muted-foreground">
        {tagline ?? "Book your dental visit online — takes about a minute."}
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground"
        >
          Sign in
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        Online booking opens in Phase 4.
      </p>
    </main>
  );
}
