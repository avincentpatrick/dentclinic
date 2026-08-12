import { RoleHeader } from "@/components/shell/RoleHeader";

export default function PatientHome() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <RoleHeader />
      <main className="mx-auto max-w-lg p-4">
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="mt-2 text-muted-foreground">
          Patient home — your next appointment, records, and booking will live
          here (Phase 4 & 8).
        </p>
      </main>
    </div>
  );
}
