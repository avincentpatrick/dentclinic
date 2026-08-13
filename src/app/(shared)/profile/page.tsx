import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { User } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ProfileForm } from "@/components/patients/ProfileForm";
import { updateOwnProfile } from "@/app/actions/profile";
import { logRead } from "@/lib/audit/log-read";
import { getActor } from "@/lib/auth/actor";

export const metadata: Metadata = { title: "Profile" };

const ROLE_LABEL: Record<string, string> = {
  patient: "Patient",
  staff: "Front desk",
  doctor: "Doctor",
  superadmin: "Administrator",
};

/**
 * The signed-in person's own record.
 *
 * TWO SECTIONS, and that is what makes an ALL_ROLES route honest. Increment 2.0
 * did real work to make this route role-correct — the `(shared)` group reads the
 * claim instead of hardcoding "patient", and `SHARED_SURFACES` enlarges the text
 * only for patients — but a staff user arriving here with no `patients` row
 * would otherwise see nothing but "no record", which reads like a broken page.
 * The account section is always worth the visit.
 */
export default async function ProfilePage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const { data: patient } = await actor.supabase
    .from("patients")
    .select(
      "id, patient_number, first_name, middle_name, last_name, email, dob, phone, sex, address, emergency_contact_name, emergency_contact_phone, marketing_opt_in",
    )
    .eq("profile_id", actor.userId)
    .is("deleted_at", null)
    .maybeSingle();

  // PHI read, audited like any other — AFTER the row is confirmed readable,
  // because log_read is security definer and performs no ownership check of its
  // own.
  //
  // The deciding argument is the staff-side case, not the patient one: this
  // route is granted to ALL_ROLES, so a staff, doctor or superadmin whose login
  // is linked to a patients row reads a real chart here. An unaudited /profile
  // would be a hole in "who looked at this patient" reachable by exactly the
  // roles with the most access. `entity` stays "patients" rather than a new
  // "profile" string: the row already carries actor_id, so self-reads are
  // separable by query, and a second entity name would just split the log.
  if (patient) await logRead("patients", patient.id, patient.id);

  return (
    <>
      <PageHeader title="Profile" description="Your account and the details the clinic holds." />

      <section aria-labelledby="account-heading" className="flex flex-col gap-3">
        <h2 id="account-heading" className="text-base font-medium text-foreground">
          Your account
        </h2>
        <dl className="grid gap-3 rounded-xl bg-card p-4 ring-1 ring-border sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">Email address</dt>
            {/* Plain text, deliberately not a disabled Field: a greyed-out input
                invites "why can't I fix this", and the answer is that changing
                it belongs to the verified sign-in flow, not this form. */}
            <dd className="text-base break-words text-foreground">{actor.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Role</dt>
            <dd className="text-base text-foreground">{ROLE_LABEL[actor.role] ?? actor.role}</dd>
          </div>
          {patient && (
            <div>
              <dt className="text-sm text-muted-foreground">Patient number</dt>
              <dd className="text-base text-foreground">{patient.patient_number}</dd>
            </div>
          )}
        </dl>
        <p className="text-sm text-muted-foreground">
          Your email address is how you sign in. Contact the clinic to change it.{" "}
          <Link href="/settings/appearance" className="underline underline-offset-4">
            Appearance settings
          </Link>
        </p>
      </section>

      <section aria-labelledby="details-heading" className="mt-8">
        <h2 id="details-heading" className="text-base font-medium text-foreground">
          Your details
        </h2>

        {patient ? (
          <ProfileForm
            action={updateOwnProfile}
            initial={{
              first_name: patient.first_name,
              middle_name: patient.middle_name ?? "",
              last_name: patient.last_name,
              dob: patient.dob ?? "",
              phone: patient.phone ?? "",
              sex: patient.sex,
              address: patient.address ?? "",
              emergency_contact_name: patient.emergency_contact_name ?? "",
              emergency_contact_phone: patient.emergency_contact_phone ?? "",
              marketing_opt_in: patient.marketing_opt_in ? "on" : "",
            }}
          />
        ) : actor.role === "patient" ? (
          // An EmptyState with a link, NOT a redirect to /register: a redirect
          // would steal the back button and read as a loop for anyone who
          // arrived here on purpose.
          <div className="mt-4">
            <EmptyState
              register="first-use"
              icon={User}
              title="You don't have a patient record yet"
              description="Register to book appointments and keep your details with the clinic."
              action={{ label: "Register", href: "/register" }}
            />
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              register="cleared"
              icon={User}
              title="No patient record"
              description="This login is a staff account. Patient details appear here only for people who are also patients of the clinic."
            />
          </div>
        )}
      </section>
    </>
  );
}
