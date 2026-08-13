import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/patients/RegisterForm";
import { PageHeader } from "@/components/shell/PageHeader";
import { getActor } from "@/lib/auth/actor";
import { roleHome } from "@/lib/roles";

export const metadata: Metadata = { title: "Register" };

export default async function Page() {
  const actor = await getActor();

  // Patients only, re-checked here and not just in middleware. /register calls a
  // security definer RPC that creates a patient row for auth.uid(); a doctor
  // reaching it would give their own login a chart.
  if (!actor) redirect("/login");
  if (actor.role !== "patient") redirect(roleHome(actor.role));

  // Idempotent alongside the RPC's own first branch, but a registration form
  // shown to someone already registered is just confusing.
  const { data: existing } = await actor.supabase
    .from("patients")
    .select("id")
    .eq("profile_id", actor.userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) redirect("/home");

  return (
    <>
      <PageHeader
        title="Complete your registration"
        description="The clinic needs a few details before your first visit. It takes about a minute."
      />
      <RegisterForm />
    </>
  );
}
