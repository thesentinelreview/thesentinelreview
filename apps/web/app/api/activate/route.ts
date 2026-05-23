import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { query } from "@/lib/db";
import { tierForPriceIds } from "@/lib/stripe";
import { redirect } from "next/navigation";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) redirect("/pricing");

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });
  } catch {
    redirect("/pricing?checkout=error");
  }

  const paymentOk =
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required";
  if (
    !paymentOk ||
    session.client_reference_id !== userId ||
    !session.subscription
  ) {
    redirect("/pricing?checkout=error");
  }

  const priceIds = (session.line_items?.data ?? [])
    .map((li) => li.price?.id)
    .filter((x): x is string => !!x);
  const tier = tierForPriceIds(priceIds);
  if (!tier) redirect("/pricing?checkout=error");

  const sub = await stripe.subscriptions.retrieve(session.subscription as string);
  const periodEnd = sub.items.data[0]?.current_period_end ?? null;

  await query(
    `INSERT INTO user_subscriptions
       (clerk_user_id, stripe_customer_id, stripe_subscription_id, tier, status, current_period_end)
     VALUES ($1, $2, $3, $4, 'active', to_timestamp($5))
     ON CONFLICT (clerk_user_id) DO UPDATE
       SET stripe_customer_id      = EXCLUDED.stripe_customer_id,
           stripe_subscription_id  = EXCLUDED.stripe_subscription_id,
           tier                    = EXCLUDED.tier,
           status                  = 'active',
           current_period_end      = EXCLUDED.current_period_end,
           updated_at              = now()`,
    [userId, session.customer, session.subscription, tier, periodEnd],
  );

  redirect("/app?checkout=success");
}
