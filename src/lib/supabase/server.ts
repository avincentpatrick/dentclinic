import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The client for Server Components, Server Actions and Route Handlers alike.
 *
 * Typed with the generated `Database` since Phase 2.1c. Until then `.from()` and
 * `.rpc()` were `any`, which is survivable for one `user_preferences` upsert and
 * is not for a PHI table with 26 columns, three definer RPCs and a parameter
 * allow-list that IS the security boundary. Regenerate with `npm run db:types`
 * in the same commit as any migration.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components can't write cookies; middleware refreshes sessions.
          }
        },
      },
    },
  );
}
