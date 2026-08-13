"use client";

/**
 * The lookups editors' form wrapper.
 *
 * The implementation moved to `components/shared/RecordForm.tsx` in 2.2d, when
 * the feedback screens needed exactly the same wrapper. Re-exported under the
 * old name so no lookups call site changed — the same shape
 * `src/lib/patients/query.ts` uses after `src/lib/list/query.ts` was extracted
 * from it in 2.2b.
 */
export { RecordForm as LookupForm } from "@/components/shared/RecordForm";
