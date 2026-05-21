import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { query } from "@/lib/db";
import { redirect } from "next/navigation";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) redirect("/pricing");

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    redirect("/pricing?checkout=error");
  }

  if (
    session.payment_status !== "paid" ||
    session.client_reference_id !== userId ||
    !session.subscription
  ) {
    redirect("/pricing?checkout=error");
  }

  const sub = await stripe.subscriptions.retrieve(session.subscription as string);
  const periodEnd = sub.items.data[0]?.current_period_end ?? null;

  await query(
    `INSERT INTO user_subscriptions
       (clerk_user_id, stripe_customer_id, stripe_subscription_id, tier, status, current_period_end)
     VALUES ($1, $2, $3, 'analyst', 'active', to_timestamp($4::bigint))
     ON CONFLICT (clerk_user_id) DO UPDATE
       SET stripe_customer_id      = EXCLUDED.stripe_customer_id,
           stripe_subscription_id  = EXCLUDED.stripe_subscription_id,
           tier                    = 'analyst',
           status                  = 'active',
           current_period_end      = EXCLUDED.current_period_end,
           updated_at              = now()`,
    [userId, session.customer, session.subscription, periodEnd ?? null],
  );

  redirect("/app?checkout=success");
}
