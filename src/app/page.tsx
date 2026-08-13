import Link from "next/link";
import { AppearanceMenu } from "@/components/theme/AppearanceMenu";
import { getBranding } from "@/lib/branding";

export default async function Landing() {
  const { clinicName, tagline, logoUrl } = await getBranding();

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="absolute right-4 top-4">
        <AppearanceMenu />
      </div>
      {logoUrl && (
        // A plain <img>, not next/image: next.config.ts declares no `images`
        // config, and adding `remotePatterns` would both allow-list the
        // Supabase host and then 400 on any externally-hosted logo. OpenNext on
        // Cloudflare also has no built-in optimizer — it wants paid Cloudflare
        // Images, against an explicit $0 hosting target.
        //
        // alt="" because it is decorative: the clinic name is the <h1>
        // immediately below, so announcing the logo too would just repeat it.
        // Width/height are set to reserve the box and avoid layout shift.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          width={96}
          height={96}
          referrerPolicy="no-referrer"
          className="max-h-24 w-auto max-w-48 object-contain"
        />
      )}
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
