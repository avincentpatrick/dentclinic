import { RoleHeader } from "@/components/shell/RoleHeader";

export default function TodayPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <RoleHeader />
      <main className="mx-auto max-w-3xl p-4">
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="mt-2 text-muted-foreground">
          Staff & doctor day view — the agenda timeline and patient queue land
          here in Phases 3 & 8.
        </p>
      </main>
    </div>
  );
}
