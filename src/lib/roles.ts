export type AppRole = "patient" | "doctor" | "staff" | "superadmin";

/** Where each role lands after login. */
export const ROLE_HOME: Record<AppRole, string> = {
  patient: "/home",
  doctor: "/today",
  staff: "/today",
  superadmin: "/dashboard",
};

/** Minimum roles allowed per path prefix (middleware-enforced). */
export function isAllowed(pathname: string, role: AppRole | null): boolean {
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
    return role === "superadmin";
  }
  if (pathname.startsWith("/today")) {
    return role === "staff" || role === "doctor" || role === "superadmin";
  }
  if (pathname.startsWith("/home")) {
    return role !== null;
  }
  return true; // public routes
}

export function roleHome(role: AppRole | null): string {
  return role ? ROLE_HOME[role] : "/login";
}
