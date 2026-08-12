import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const metadata: Metadata = { title: "Records" };

export default function Page() {
  return (
    <>
      <PageHeader title="Records" description="Your dental history and documents." />
      <EmptyState register="first-use" icon={FileText} title="No records yet" description="Your chart appears here after your first visit (Phase 6)." />
    </>
  );
}
