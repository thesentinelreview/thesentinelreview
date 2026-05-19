import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtected = createRouteMatcher([
  "/app(.*)",
  "/api/checkout(.*)",
  "/api/billing-portal(.*)",
  "/api/activate(.*)",
]);
// The Source Feed is free in beta — Watch tier (unauthenticated) can reach it
// even though it lives under /app/. Keep the rest of /app/ behind sign-in.
const isPublic = createRouteMatcher(["/app/feed(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req) && !isPublic(req)) await auth.protect();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
