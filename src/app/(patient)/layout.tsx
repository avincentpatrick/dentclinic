import { AppShell } from "@/components/shell/AppShell";

export default function PatientLayout({ children }: LayoutProps<"/">) {
  return <AppShell role="patient">{children}</AppShell>;
}
