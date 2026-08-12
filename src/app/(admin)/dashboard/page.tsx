import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const metadata: Metadata = { title: "Dashboard" };

export default function AdminDashboard() {
  return (
    <>
      <PageHeader title="Clinic overview" description="Utilisation, exceptions and revenue at a glance." />
      <EmptyState
        register="first-use"
        icon={LayoutDashboard}
        title="No data yet"
        description="KPIs, the utilisation heatmap and exception queues arrive in Phase 8."
        action={{ label: "Open design system", href: "/design-system" }}
      />
    </>
  );
}
