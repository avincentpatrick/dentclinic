import { AppShell } from "@/components/shell/AppShell";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/roles";

/**
 * One group serves staff AND doctor (PLAN: "90% shared shell"), so the role
 * must come from the claim rather than being hardcoded — the sidebar shows
 * doctors an Availability link that front-desk staff must not see.
 */
export default async function StaffLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const role = (data?.claims?.user_role as AppRole | undefined) ?? "staff";

  return <AppShell role={role}>{children}</AppShell>;
}
