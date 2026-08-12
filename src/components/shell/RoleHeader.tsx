import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { AppearanceMenu } from "@/components/theme/AppearanceMenu";

/** Temporary Phase-0 header — replaced by the full app shell in Phase 1. */
export async function RoleHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let label = "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();
    label = profile
      ? `${profile.full_name ?? user.email} · ${profile.role}`
      : (user.email ?? "");
  }

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-3">
      <span className="font-semibold">DentClinic</span>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{label}</span>
        <AppearanceMenu />
        <form action={signOut}>
          <button className="min-h-11 rounded-md border border-input px-3 py-1.5 hover:bg-accent">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
