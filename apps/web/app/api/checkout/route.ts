import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { queryOne } from "@/lib/db";
import {
  FOUNDING_CAP,
  cleanEnv,
  foundingSoldOut,
  isFoundingPriceId,
  resolveSiteOrigin,
  tierForPriceId,
} from "@/lib/stripe";

function getStripe() {
  return new Stripe(cleanEnv(process.env.STRIPE_SECRET_KEY));
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { priceId } = (await req.json()) as { priceId?: string };
  if (!priceId) {
    return Response.json({ error: "priceId required" }, { status: 400 });
  }
  if (!tierForPriceId(priceId)) {
    return Response.json({ error: "Unknown priceId" }, { status: 400 });
  }

  // Founding-cap guard: never sell a founding seat past the cap. Server-side
  // count, no client trust. Cancelled subscriptions free their seat (status
  // filter), so a refunded self-test doesn't burn one permanently.
  if (isFoundingPriceId(priceId)) {
    const row = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n
       FROM user_subscriptions
       WHERE is_founding AND status IN ('active', 'past_due', 'trialing')`,
    );
    if (foundingSoldOut(row?.n ?? 0)) {
      return Response.json(
        { error: `The founding window is closed — all ${FOUNDING_CAP} seats are taken.` },
        { status: 409 },
      );
    }
  }

  // Fail loudly and by name when the redirect base is unset/unparseable —
  // otherwise this surfaces as Stripe's generic url_invalid on the session
  // call, which is needlessly hard to trace back to env config.
  const siteOrigin = resolveSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (!siteOrigin) {
    console.error("[checkout] checkout_misconfigured: NEXT_PUBLIC_SITE_URL", {
      state: cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) ? "present-but-unparseable" : "unset",
    });
    return Response.json(
      { error: "checkout_misconfigured: NEXT_PUBLIC_SITE_URL" },
      { status: 500 },
    );
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      customer_email: (sessionClaims?.email as string | undefined) ?? undefined,
      success_url: `${siteOrigin}/api/activate?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteOrigin}/pricing`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    // Log the fields that name the failure — the raw object truncates in
    // Vercel's log table and hides message/param.
    const e = err as { message?: string; param?: string; code?: string; type?: string };
    console.error("[checkout] Stripe error", {
      message: e?.message,
      param: e?.param,
      code: e?.code,
      type: e?.type,
    });
    return Response.json({ error: "Failed to create checkout session" }, { status: 502 });
  }
}
