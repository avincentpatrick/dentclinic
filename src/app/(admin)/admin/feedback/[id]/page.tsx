import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { TriageForm } from "@/components/feedback-report/TriageForm";
import {
  FeedbackSeverityChip,
  FeedbackStatusChip,
  RecordChip,
} from "@/components/shared/StatusChip";
import { triageReport } from "@/app/actions/feedback";
import { getReport } from "@/lib/feedback/read";
import { KIND_LABELS } from "@/lib/feedback/schema";

const BASE = "/admin/feedback";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(
  props: PageProps<"/admin/feedback/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) return { title: "Report" };
  const report = await getReport(id);
  return { title: report ? report.title.slice(0, 60) : "Report" };
}

/**
 * One report, and the only three fields anyone may change.
 *
 * The report itself is rendered as static text because it IS static: the guard
 * trigger in 0015 pins `title`, `body`, `path`, `kind` and the reporter, so
 * there is deliberately no control for them. 16-feedback.md rule 6 — a filed
 * report is a fact, and with no comment table in Phase 2 an editable body would
 * let a report be rewritten under a triage note that answered the original.
 */
export default async function ReportPage(props: PageProps<"/admin/feedback/[id]">) {
  const { id } = await props.params;
  // Guard the param before it reaches PostgREST: a non-uuid `.eq("id", …)` is a
  // 400 from the database rather than a 404 from us.
  if (!UUID_RE.test(id)) notFound();

  const report = await getReport(id);
  if (!report) notFound();

  return (
    <>
      <PageHeader
        title={report.title}
        description={`${KIND_LABELS[report.kind]}, reported by a ${report.reporter_role}.`}
        actions={
          <Link
            href={BASE}
            className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Back to the queue
          </Link>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FeedbackStatusChip status={report.status} />
        <FeedbackSeverityChip severity={report.severity} />
        {report.deleted_at && <RecordChip state="archived" />}
      </div>

      <section aria-labelledby="report-body" className="mt-6">
        <h2 id="report-body" className="text-lg font-semibold text-foreground">
          What was reported
        </h2>
        {/* `whitespace-pre-wrap` so the reporter's line breaks survive. Rendered
            as text, never as markup: this is untrusted user input and React
            escapes it, which is the whole reason there is no rich text here. */}
        <p className="mt-2 whitespace-pre-wrap text-base text-foreground">{report.body}</p>
      </section>

      <section aria-labelledby="report-context" className="mt-6">
        <h2 id="report-context" className="text-lg font-semibold text-foreground">
          Context
        </h2>
        <dl className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Detail label="Screen">
            {/* A masked route PATTERN — rule 1. `/patients/[id]`, never a real
                id, so this queue can never become a record of which patient a
                staff member was looking at. */}
            <span className="font-mono text-sm">{report.path ?? "Not recorded"}</span>
          </Detail>
          <Detail label="Filed">
            <time dateTime={report.created_at}>
              {new Date(report.created_at).toLocaleString("en-PH", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
          </Detail>
          <Detail label="Screen size">{report.viewport ?? "Not recorded"}</Detail>
          <Detail label="Browser">
            <span className="break-words text-sm">{report.user_agent ?? "Not recorded"}</span>
          </Detail>
        </dl>
      </section>

      <section aria-labelledby="report-triage" className="mt-8">
        <h2 id="report-triage" className="text-lg font-semibold text-foreground">
          Triage
        </h2>
        <TriageForm
          action={triageReport.bind(null, id)}
          initial={{
            status: report.status,
            severity: report.severity,
            triage_note: report.triage_note ?? "",
          }}
          cancelHref={BASE}
        />
      </section>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-foreground">{children}</dd>
    </div>
  );
}
