import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Gate #2. Gate #1 is middleware (`/design-system` → superadmin in the route
 * table); this is defence in depth plus the audit bypass.
 *
 * The bypass lives HERE and not in middleware on purpose. Middleware runs in
 * the Edge runtime where Next inlines `process.env` at BUILD time — a bypass
 * there would be baked into whatever artifact was built with the flag set. A
 * Server Component runs in the Node/Workers runtime where `process.env` is a
 * RUNTIME read, and `A11Y_AUDIT` is not in wrangler.jsonc vars and is not a
 * secret. So on the deployed Worker it is always undefined and the bypass is
 * structurally unreachable, regardless of how the artifact was built.
 *
 * Blast radius is zero by construction anyway: the gallery renders only
 * hard-coded fixtures (enforced by eslint no-restricted-imports), and
 * scripts/assert-no-bypass.mjs fails `npm run deploy` if the flag is set.
 */
export default async function DesignSystemLayout({ children }: LayoutProps<"/">) {
  if (process.env.A11Y_AUDIT !== "1") {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.user_role !== "superadmin") notFound();
  }

  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
