import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * A session-less Supabase client.
 *
 * Exists because `unstable_cache` forbids reading uncached request state —
 * Next's own reference: "Accessing uncached data sources such as `headers` or
 * `cookies` inside a cache scope is not supported" — and every other client in
 * this repo is cookie-bound. `getBranding()` used to reach `cookies()` through
 * `@/lib/supabase/server`, which is very likely why the original implementation
 * reached for a module-level memo instead of the Data Cache.
 *
 * It is also simply the correct client for the job. `public.clinic_branding` is
 * granted to `anon` precisely so the landing page can read it with no session,
 * and a cache entry shared by every visitor must not be produced with one
 * visitor's JWT.
 *
 * USE ONLY for data that is identical for every visitor and readable by `anon`.
 * Today that is exactly `clinic_branding`. Anything row-level-scoped must keep
 * using `@/lib/supabase/server`, or RLS will correctly see no user and return
 * nothing — a silent empty result, not an error.
 */
export function createAnonClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
