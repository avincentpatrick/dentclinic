import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  patient: "Patient",
  doctor: "Doctor",
  staff: "Front desk",
  superadmin: "Administrator",
};

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Async server component — the only data fetch in the shell, which is why it
 * sits behind its own <Suspense> boundary with UserChipSkeleton. The shell
 * paints immediately; this fills in.
 */
export async function UserChip({ collapsed = false }: { collapsed?: boolean }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const name = profile?.full_name ?? user.email ?? "Signed in";
  const role = profile?.role ? (ROLE_LABEL[profile.role] ?? profile.role) : null;

  return (
    <div className={cn("flex items-center gap-3", collapsed && "flex-col gap-2")}>
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
      >
        {initials(profile?.full_name ?? null, user.email ?? null)}
      </span>

      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          {role && <p className="truncate text-xs text-muted-foreground">{role}</p>}
        </div>
      )}

      <form action={signOut}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="min-h-11 text-muted-foreground hover:text-foreground"
        >
          {collapsed ? <span className="sr-only">Sign out</span> : "Sign out"}
          {collapsed && <span aria-hidden="true">⎋</span>}
        </Button>
      </form>
    </div>
  );
}
