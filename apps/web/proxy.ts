import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

const isProtected = createRouteMatcher(["/app(.*)", "/api/checkout(.*)"]);

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

export default async function proxy(req: NextRequest) {
  try {
    return await (clerkHandler as unknown as (r: NextRequest) => Promise<NextResponse>)(req);
  } catch (e) {
    console.error("[clerk-proxy] init error:", e instanceof Error ? e.message : String(e));
    if (isProtected(req)) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
