"use client";

import { BrandingForm } from "@/components/admin/BrandingForm";
import { IDLE, type ActionState } from "@/lib/forms/action-state";
import type { BrandingField } from "@/lib/settings/branding-schema";

/**
 * BrandingForm with a no-op action, for the gallery.
 *
 * A client wrapper is required, not stylistic: `registry.tsx` is a Server
 * Component, and passing `action={fn}` from there throws "Functions cannot be
 * passed directly to Client Components". Same constraint the SubmitButton
 * specimen works around by rendering a `<form>` with no action at all.
 *
 * `mintUploadUrl` is deliberately omitted — a specimen may not import
 * `@/app/actions/*` (eslint-enforced), and without a minter the file picker
 * renders disabled, which is the honest representation of a control that needs
 * a server.
 *
 * The `initialState` prop exists for this file: it is what lets the matrix put
 * the invalid and success states through 2 themes x 4 font steps under axe.
 * PatientForm has no equivalent, so its error states remain unproven — this is
 * the pattern to copy when that is fixed.
 */
async function noop(): Promise<ActionState<BrandingField>> {
  return IDLE as ActionState<BrandingField>;
}

const INITIAL = {
  clinic_name: "Sunrise Dental",
  tagline: "Gentle care, on time.",
  logo_url: "",
  brand_hue: "195",
};

export function BrandingFormSpecimen({
  state,
}: {
  state?: "idle" | "invalid" | "success";
}) {
  const initialState: ActionState<BrandingField> | undefined =
    state === "invalid"
      ? {
          status: "invalid",
          fieldErrors: {
            clinic_name: "Clinic name is required.",
            brand_hue: "Brand colour must be between 0 and 359.",
          },
          values: { ...INITIAL, clinic_name: "", brand_hue: "400" },
        }
      : state === "success"
        ? { status: "success", message: "Branding saved.", values: INITIAL }
        : undefined;

  return <BrandingForm action={noop} initial={INITIAL} initialState={initialState} />;
}
