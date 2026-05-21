import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Deny-by-default for the API surface: every route under /api requires a
// signed-in Clerk session EXCEPT the routes allowlisted here. Keep the
// allowlist minimal — Stripe's webhook authenticates by request signature, not
// a Clerk session, so it must stay public.
//
// NOTE: this protects /api/admin/* as "signed in" only. A reintroduced admin
// route must add its own admin-role check on top of this baseline.
const isApiRoute = createRouteMatcher(["/api/(.*)"]);
const isPublicApiRoute = createRouteMatcher(["/api/webhooks/stripe(.*)"]);

// The analyst area under /app requires sign-in, except the Source Feed, which
// is free in beta (Watch tier) even though it lives under /app/.
const isProtectedPage = createRouteMatcher(["/app(.*)"]);
const isPublicPage = createRouteMatcher(["/app/feed(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // API: unauthenticated, non-allowlisted requests get a JSON 401 so fetch
  // callers receive a clean error instead of an auth redirect.
  if (isApiRoute(req) && !isPublicApiRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Pages.
  if (isProtectedPage(req) && !isPublicPage(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
