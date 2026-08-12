import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowed, isPublicPath, roleHome, type AppRole } from "@/lib/roles";
import {
  APPEARANCE_COOKIE_OPTIONS,
  FONT_COOKIE,
  SYNC_COOKIE,
  THEME_COOKIE,
  parseFontPref,
  parseTheme,
} from "@/lib/appearance";

// The route table lives in @/lib/roles — one source of truth for middleware,
// the /design-system gate, and scripts/check-routes.mjs.

/**
 * Routes whose authorisation is enforced by their own layout instead of here.
 *
 * Only /design-system, and for a specific reason: it needs an env-gated bypass
 * so the axe run can reach it without a session. Middleware runs in the Edge
 * runtime, where Next inlines `process.env` at BUILD time — a bypass here could
 * never be toggled at run time, and if it were set during a build it would be
 * baked into the artifact. `src/app/design-system/layout.tsx` is a Server
 * Component, so it reads `process.env` at RUNTIME on Workers, where A11Y_AUDIT
 * is undefined. Same authorisation check, strictly safer bypass.
 *
 * These paths still appear in ROUTE_RULES so check-routes.mjs covers them and
 * the role requirement stays documented in one place.
 */
const LAYOUT_GATED = ["/design-system"];

function isLayoutGated(pathname: string): boolean {
  return LAYOUT_GATED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  // Collect cookie writes rather than mutating a response mid-flight. The old
  // shape rebuilt `response` inside setAll and then returned a *fresh*
  // NextResponse.redirect on three paths — silently discarding rotated Supabase
  // auth tokens whenever a refresh coincided with a redirect.
  const pending: { name: string; value: string; options?: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            pending.push({ name, value, options });
          });
        },
      },
    },
  );

  /** Attach every queued cookie to whichever response we end up returning. */
  function finish(response: NextResponse) {
    pending.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options),
    );
    return response;
  }

  // Refresh the session and read role from the JWT (user_role custom claim).
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const role = (claims?.user_role as AppRole | undefined) ?? null;
  const userId = claims?.sub as string | undefined;
  const { pathname } = request.nextUrl;

  // ---------------------------------------------------------------------
  // "DB wins on login": merge user_preferences into the cookies exactly once
  // per browser session. Writing onto request.cookies makes THIS render use
  // them, so login lands on the right theme with no flash and no second
  // navigation. dc_prefsync is a session cookie and is set even when no row
  // exists, so users who never opened settings are not re-queried.
  // ---------------------------------------------------------------------
  if (userId) {
    if (request.cookies.get(SYNC_COOKIE)?.value !== userId) {
      try {
        const { data: prefs } = await supabase
          .from("user_preferences")
          .select("theme, font_size")
          .eq("user_id", userId)
          .maybeSingle();

        if (prefs) {
          const theme = parseTheme(prefs.theme);
          const font = parseFontPref(prefs.font_size);
          request.cookies.set(THEME_COOKIE, theme);
          request.cookies.set(FONT_COOKIE, font);
          pending.push({ name: THEME_COOKIE, value: theme, options: APPEARANCE_COOKIE_OPTIONS });
          pending.push({ name: FONT_COOKIE, value: font, options: APPEARANCE_COOKIE_OPTIONS });
        }
      } catch {
        // Never block a request on a preference read.
      }
      pending.push({
        name: SYNC_COOKIE,
        value: userId,
        options: { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
      });
    }
  } else if (request.cookies.has(SYNC_COOKIE)) {
    // Signed out — clear the marker so the next login re-syncs.
    pending.push({ name: SYNC_COOKIE, value: "", options: { path: "/", maxAge: 0 } });
  }

  const gatedElsewhere = isLayoutGated(pathname);

  if (!gatedElsewhere && !isPublicPath(pathname) && role === null) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return finish(NextResponse.redirect(url));
  }

  // Wrong-role access → redirect to own home, never 404 (no route enumeration).
  if (!gatedElsewhere && !isPublicPath(pathname) && !isAllowed(pathname, role)) {
    const url = request.nextUrl.clone();
    url.pathname = roleHome(role);
    return finish(NextResponse.redirect(url));
  }

  // Logged-in users hitting /login or / go straight to their home.
  if (role !== null && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = roleHome(role);
    return finish(NextResponse.redirect(url));
  }

  // The root layout needs the pathname to resolve the `auto` font step, and a
  // Server Component cannot see it. Build these headers from request.headers
  // AFTER the cookie writes above so both propagate.
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);

  // PRESENTATION ONLY — never an authorization input.
  //
  // `/profile` is a patient surface for a patient and an ordinary page for
  // everyone else, and only the root layout can set data-font-size (it owns
  // <html>), so it needs the role. It cannot read the claim itself without
  // putting an auth round trip on every request; middleware already has it.
  //
  // These headers are built from `request.headers`, which a client controls, so
  // this must always set-or-delete: leaving a forged `x-role` in place would let
  // a visitor pick their own font step. Harmless in itself — which is precisely
  // why nothing may ever authorize on it. Authorization is isAllowed() above and
  // RLS in the database.
  if (role) headers.set("x-role", role);
  else headers.delete("x-role");

  return finish(NextResponse.next({ request: { headers } }));
}

export const config = {
  matcher: [
    // Everything except static assets and images
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
