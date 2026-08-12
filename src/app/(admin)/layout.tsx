import { AppShell } from "@/components/shell/AppShell";

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return <AppShell role="superadmin">{children}</AppShell>;
}
