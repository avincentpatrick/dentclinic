import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { BrandingForm } from "@/components/admin/BrandingForm";
import { createLogoUploadUrl, updateBranding } from "@/app/actions/settings";
import { getBrandingFresh } from "@/lib/branding";

export const metadata: Metadata = { title: "Branding" };

/**
 * The superadmin branding editor.
 *
 * `getBrandingFresh()` rather than `getBranding()`, deliberately: the cached
 * read is shared by every visitor and can be up to an hour old, and a form
 * seeded from it would write those stale values straight back over whatever a
 * second admin had just saved. The editor is the one caller that must see the
 * database.
 *
 * No `logRead`: clinic configuration is not PHI, and `private.audit_log` is
 * append-only with 6+ year retention, so a row per settings page view would be
 * permanent noise. The WRITE is audited instead — `update_clinic_branding`
 * records one `settings_change` row per save, with a before/after diff.
 */
export default async function BrandingSettingsPage() {
  const branding = await getBrandingFresh();

  return (
    <>
      <PageHeader
        title="Branding"
        description="How the clinic is named and coloured everywhere in the app."
      />
      <BrandingForm
        action={updateBranding}
        mintUploadUrl={createLogoUploadUrl}
        initial={{
          clinic_name: branding.clinicName,
          tagline: branding.tagline ?? "",
          logo_url: branding.logoUrl ?? "",
          brand_hue: String(branding.brandHue),
        }}
      />
    </>
  );
}
