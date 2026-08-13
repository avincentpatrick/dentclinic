import Link from "next/link";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { SubmitButton } from "@/components/shared/SubmitButton";
import type { Confirmable } from "@/lib/forms/action-state";

/**
 * The duplicate-patient soft stop. Rendered INSIDE the form, above the fields.
 *
 * `tone="warning"`, never `danger`: a `confirm` is nobody's error — it is valid
 * input that a human should look at first — and `--destructive` next to a
 * patient's name reads as something being wrong with the patient.
 *
 * ## The two modes are two shapes of `Confirmable`, not a prop
 *
 * There is deliberately no `mode="staff" | "self"`. `existingHref`,
 * `proceedLabel` and `matches` are optional on `Confirmable` precisely so a
 * patient-facing state omits all three, which puts enumeration-safety in the
 * TYPE rather than in this markup — the same reasoning that makes StatusChip
 * derive its label from a key instead of accepting one. A `mode` prop would
 * move that guarantee somewhere it can be passed wrongly.
 *
 * So the single `proceedLabel` guard below is the whole mechanism: with no
 * proceed label there is no match list, no link, no name, no patient number and
 * no way to continue — just a sentence. Even if a future caller wrongly passed
 * `matches` into a patient-facing confirm, nothing about them would render.
 *
 * ## Where each shape is used
 *
 * The staff shape is live on /patients/new and /patients/[id]/edit. The self
 * shape has NO live call site in 2.1, and that is the design working rather
 * than a gap: `claim_or_create_patient` takes no email (it reads a verified one
 * from auth.users), and `find_patient_duplicates` raises `forbidden` for the
 * patient role — so a patient can never trigger a probe, and /register renders
 * no warning at all. Its first real caller is Phase 4 guest booking, which
 * creates provisional rows from a PUBLIC form and is exactly where a
 * non-revealing confirm is needed. The gallery specimen keeps the degenerate
 * rendering proven until then.
 */
export function DuplicateWarning({ confirm }: { confirm: Confirmable }) {
  const staffMode = Boolean(confirm.proceedLabel);

  return (
    <InlineAlert tone="warning" title={confirm.title}>
      <p>{confirm.detail}</p>

      {staffMode && confirm.matches && confirm.matches.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {confirm.matches.map((m) => (
            <li key={m.id} className="rounded-md border border-border bg-background/60 p-3">
              <Link
                href={`/patients/${m.id}`}
                className="font-medium text-primary underline underline-offset-4"
              >
                {m.fullName}
              </Link>{" "}
              <span className="text-muted-foreground">· {m.patientNumber}</span>
              <p className="mt-1 text-sm text-muted-foreground">
                {m.reason} · {CONFIDENCE_LABEL[m.confidence]}
              </p>
            </li>
          ))}
        </ul>
      )}

      {staffMode && (
        <div className="mt-3">
          <SubmitButton
            idleLabel={confirm.proceedLabel!}
            pendingLabel="Saving…"
            variant="outline"
            // The ack rides on THIS button's name/value, not a hidden input.
            // A hidden input is submitted by every button in the form, so the
            // primary "Create patient" would carry it too and silently skip the
            // check it is supposed to re-run. Here, only this button
            // acknowledges anything — and because the ack is a hash of the
            // values it was minted for, editing a field before pressing it
            // makes the server re-run the check anyway.
            name="ack"
            value={confirm.ack}
          />
        </div>
      )}
    </InlineAlert>
  );
}

const CONFIDENCE_LABEL: Record<"certain" | "likely" | "possible", string> = {
  certain: "Almost certainly the same person",
  likely: "Likely the same person",
  possible: "Possibly the same person",
};
