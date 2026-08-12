"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  APPEARANCE_COOKIE_OPTIONS,
  FONT_COOKIE,
  THEME_COOKIE,
  parseFontPref,
  parseTheme,
} from "@/lib/appearance";

/**
 * Persist appearance preferences: cookie always, DB when signed in.
 *
 * Takes FormData so <form action={savePreferences}> works with JavaScript
 * disabled. The client enhances it — AppearancePanel mutates the DOM
 * synchronously first, so the UI is instant and this call is pure persistence.
 *
 * No revalidatePath/router.refresh: the DOM is already correct, and because the
 * cookie is written before this returns, the Server Action's own revalidation
 * re-renders <html> with identical attributes. A refresh would only risk a
 * flicker on a slow connection.
 */
export async function savePreferences(formData: FormData) {
  const jar = await cookies();
  const patch: { theme?: string; font_size?: string } = {};

  const theme = formData.get("theme");
  if (theme !== null) {
    const value = parseTheme(theme);
    jar.set(THEME_COOKIE, value, APPEARANCE_COOKIE_OPTIONS);
    patch.theme = value;
  }

  const fontSize = formData.get("fontSize");
  if (fontSize !== null) {
    const value = parseFontPref(fontSize);
    jar.set(FONT_COOKIE, value, APPEARANCE_COOKIE_OPTIONS);
    patch.font_size = value;
  }

  if (Object.keys(patch).length === 0) return;

  // Signed-out users are cookie-only. Not an error path.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) return;

  // No row is auto-created at signup, so this is an upsert: "no row" simply
  // means "no DB preference yet", which composes with the middleware sync.
  await supabase
    .from("user_preferences")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
}
