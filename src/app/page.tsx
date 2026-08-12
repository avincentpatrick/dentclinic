import Link from "next/link";

export default function Landing() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <h1 className="text-3xl font-bold text-foreground">DentClinic</h1>
      <p className="max-w-md text-muted-foreground">
        Book your dental visit online — takes about a minute.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground"
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
