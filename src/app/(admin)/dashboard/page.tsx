import { RoleHeader } from "@/components/shell/RoleHeader";

export default function AdminDashboard() {
  return (
    <div className="flex min-h-dvh flex-col">
      <RoleHeader />
      <main className="mx-auto w-full max-w-5xl p-4">
        <h1 className="text-2xl font-semibold">Clinic overview</h1>
        <p className="mt-2 text-muted-foreground">
          Superadmin dashboard — KPIs, settings, lookups, users, and audit log
          arrive in Phases 2 & 8.
        </p>
      </main>
    </div>
  );
}
