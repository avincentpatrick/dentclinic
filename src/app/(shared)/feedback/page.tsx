import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessageSquareWarning } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { FeedbackForm } from "@/components/feedback-report/FeedbackForm";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { FeedbackStatusChip } from "@/components/shared/StatusChip";
import { fileReport } from "@/app/actions/feedback";
import { getActor } from "@/lib/auth/actor";
import { getOwnReports } from "@/lib/feedback/read";
import { maskPath } from "@/lib/feedback/path";
import { KIND_LABELS } from "@/lib/feedback/schema";

export const metadata: Metadata = { title: "Report a problem" };

/**
 * Report a problem, and see what you have already sent.
 *
 * In the `(shared)` route group, which reads the real claim, because this is
 * granted to ALL_ROLES: a patient, the front desk, a doctor and the superadmin
 * all file reports and all need their own shell around the form. The group's
 * own doc comment and `SHARED_SURFACES` have both named `/feedback` since 2.2b,
 * before it existed.
 *
 * NO read audit. PROGRESS decision 21 draws the line at PHI: `/profile` is
 * audited because a staff login linked to a patients row reads a real chart
 * there, and `/admin/lookups` is not because configuration is not PHI. A
 * person's own bug reports are neither — and `private.audit_log` is
 * append-only, purge-exempt and 6+ years, so a row per page view would be
 * permanent noise in the log that answers "who looked at this patient".
 */
export default async function FeedbackPage(props: PageProps<"/feedback">) {
  const actor = await getActor();
  // Middleware already gates this, but a Server Component re-checks rather than
  // trusting navigation — and `getActor` is what gives us the id below.
  if (!actor) redirect("/login");

  const sp = await props.searchParams;
  const filed = sp.filed === "1";

  // The nav link appends the screen the reporter came from. UNTRUSTED: masked
  // here so the form shows a real pattern, and masked AGAIN in `fileReport`,
  // which is the masking that counts.
  const from = maskPath(typeof sp.from === "string" ? sp.from : null);

  const reports = await getOwnReports(actor.userId);

  return (
    <>
      <PageHeader
        title="Report a problem"
        description="Tell the clinic's administrator what went wrong, or suggest something that would work better."
      />

      {filed && (
        <div className="mt-4">
          <InlineAlert tone="success" title="Thanks — your report was sent.">
            <p>
              It is in the administrator&apos;s queue. You can follow its status below. Nobody is
              emailed about it, so there is nothing else you need to do.
            </p>
          </InlineAlert>
        </div>
      )}

      {from && (
        <div className="mt-4">
          <InlineAlert tone="info" title="Reporting about a screen you were just on">
            <p>
              This report will be tagged <code className="font-mono">{from}</code>. Only the screen
              is recorded, never which record you were viewing.
            </p>
          </InlineAlert>
        </div>
      )}

      <FeedbackForm
        action={fileReport}
        initial={{ kind: "bug", severity: "minor", title: "", body: "", from: from ?? "" }}
      />

      <section aria-labelledby="my-reports" className="mt-10">
        <h2 id="my-reports" className="text-lg font-semibold text-foreground">
          My reports
        </h2>

        {reports.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              register="first-use"
              icon={MessageSquareWarning}
              title="You haven't sent any reports"
              description="Anything you send will be listed here with its status."
            />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {reports.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-border sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">{r.title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {KIND_LABELS[r.kind]} ·{" "}
                    <time dateTime={r.created_at}>
                      {new Date(r.created_at).toLocaleDateString("en-PH", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                    {r.path ? ` · ${r.path}` : ""}
                  </span>
                </span>
                <FeedbackStatusChip status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
