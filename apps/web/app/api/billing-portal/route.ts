import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { cleanEnv } from "@/lib/stripe";
import { queryOne } from "@/lib/db";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await queryOne<{ stripe_customer_id: string | null }>(
    `SELECT stripe_customer_id FROM user_subscriptions WHERE clerk_user_id = $1`,
    [userId],
  );

  if (!row?.stripe_customer_id) {
    return Response.json({ error: "No billing account found" }, { status: 404 });
  }

  const stripe = new Stripe(cleanEnv(process.env.STRIPE_SECRET_KEY));
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${cleanEnv(process.env.NEXT_PUBLIC_SITE_URL)}/pricing`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    console.error("[billing-portal] Stripe error", err);
    return Response.json({ error: "Failed to open billing portal" }, { status: 502 });
  }
}
