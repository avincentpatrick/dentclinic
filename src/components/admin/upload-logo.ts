import { createClient } from "@/lib/supabase/client";
import { LOGO_BUCKET } from "@/lib/settings/branding-schema";

/**
 * PUTs the file straight to Supabase Storage with a token minted server-side.
 *
 * Browser-side on purpose. The whole point of the signed-upload handshake is
 * that the image bytes never pass through the Worker: a Server Action would
 * have to carry them in its payload, against Next's 1 MB
 * `serverActions.bodySizeLimit`, and raising that limit would mean raising it
 * for every action in the app.
 *
 * A separate module rather than an inline import inside BrandingForm so the
 * boundary is obvious: this is the only client code in the admin tree that
 * talks to Supabase directly.
 */
export async function uploadLogo(path: string, token: string, file: File): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(LOGO_BUCKET)
    .uploadToSignedUrl(path, token, file, { contentType: file.type });
  return !error;
}
