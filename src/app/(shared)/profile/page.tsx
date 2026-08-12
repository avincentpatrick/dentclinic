import type { Metadata } from "next";
import { User } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const metadata: Metadata = { title: "Profile" };

export default function Page() {
  return (
    <>
      <PageHeader title="Profile" description="Your details and preferences." />
      <EmptyState register="first-use" icon={User} title="Profile coming soon" description="Contact details and medical history arrive in Phase 2." />
    </>
  );
}
