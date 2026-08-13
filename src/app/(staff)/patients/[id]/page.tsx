import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archivePatient, restorePatient } from "@/app/actions/patients";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { RecordChip } from "@/components/shared/StatusChip";
import { SoftDeleteMenu } from "@/components/shared/SoftDeleteMenu";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { logRead } from "@/lib/audit/log-read";
import { formatDateTime, formatDob, patientAge } from "@/lib/patients/format";
import { SEX_OPTIONS } from "@/lib/patients/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Patient" };

const DETAIL_COLUMNS =
  "id, patient_number, first_name, middle_name, last_name, full_name, email, dob, phone, sex, address, emergency_contact_name, emergency_contact_phone, marketing_opt_in, is_provisional, profile_id, consent_given_at, consent_version, created_at, updated_at, deleted_at";

export default async function Page({ params, searchParams }: PageProps<"/patients/[id]">) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: patient } = await supabase
    .from("patients")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  // notFound BEFORE the audit write: log_read is security definer and takes
  // caller-supplied ids with no ownership check, so logging first would record
  // a read of a record RLS just refused to return.
  if (!patient) notFound();

  await logRead("patients", patient.id, patient.id);

  const age = patientAge(patient.dob);
  const sexLabel = SEX_OPTIONS.find((o) => o.value === patient.sex)?.label ?? "—";

  return (
    <>
      <PageHeader
        title={patient.full_name ?? patient.patient_number}
        description={`${patient.patient_number}${age !== null ? ` · ${age} years old` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            {!patient.deleted_at && (
              <Button asChild variant="outline" className="min-h-11">
                <Link href={`/patients/${patient.id}/edit`}>Edit</Link>
              </Button>
            )}
            <SoftDeleteMenu
              label={patient.full_name ?? patient.patient_number}
              archived={Boolean(patient.deleted_at)}
              archiveAction={archivePatient.bind(null, patient.id, `/patients/${patient.id}`)}
              restoreAction={restorePatient.bind(null, patient.id, `/patients/${patient.id}`)}
            />
          </div>
        }
      />

      <div className="mt-4 flex flex-col gap-4">
        {sp.created === "1" && (
          <InlineAlert tone="success" title="Patient record created." />
        )}
        {sp.saved === "1" && <InlineAlert tone="success" title="Changes saved." />}

        {patient.deleted_at && (
          <InlineAlert tone="info" title="This record is archived">
            <p>
              Nothing has been deleted. Restore it from the actions menu to edit or book for this
              patient.
            </p>
          </InlineAlert>
        )}

        {patient.is_provisional && !patient.deleted_at && (
          <InlineAlert tone="warning" title="Provisional record">
            <p>
              This record was created automatically and has not been confirmed with the patient.
              Check the details before booking.
            </p>
          </InlineAlert>
        )}

        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 rounded-lg border border-border p-4 sm:grid-cols-2">
          <Row label="Full name" value={[patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(" ")} />
          <Row label="Date of birth" value={formatDob(patient.dob)} />
          <Row label="Sex" value={sexLabel} />
          <Row label="Email" value={patient.email ?? "—"} />
          <Row label="Mobile number" value={patient.phone ?? "—"} />
          <Row label="Address" value={patient.address ?? "—"} />
          <Row label="Emergency contact" value={patient.emergency_contact_name ?? "—"} />
          <Row label="Emergency number" value={patient.emergency_contact_phone ?? "—"} />
          <Row label="Clinic news" value={patient.marketing_opt_in ? "Subscribed" : "Not subscribed"} />
          <Row
            label="Patient login"
            value={patient.profile_id ? "Linked" : "Not linked yet"}
          />
          <Row
            label="Consent"
            value={
              patient.consent_given_at
                ? `${formatDateTime(patient.consent_given_at)} (${patient.consent_version})`
                : "Not given yet"
            }
          />
          <Row label="Record status" value={
            patient.deleted_at ? <RecordChip state="archived" size="sm" />
              : patient.is_provisional ? <RecordChip state="provisional" size="sm" />
              : "Active"
          } />
          <Row label="Last updated" value={formatDateTime(patient.updated_at)} />
        </dl>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-foreground">{value}</dd>
    </div>
  );
}
