import Stripe from "stripe";
import { query } from "@/lib/db";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return Response.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[stripe-webhook] invalid signature", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const clerkUserId = session.client_reference_id;
      if (!clerkUserId || !session.subscription) break;

      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      // In Stripe v22, current_period_end is on the first subscription item
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
        [clerkUserId, session.customer, session.subscription, periodEnd ?? null],
      );
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const status = sub.status === "active" ? "active"
        : sub.status === "trialing" ? "trialing"
        : sub.status === "past_due" ? "past_due"
        : "cancelled";
      const periodEnd = sub.items.data[0]?.current_period_end ?? null;

      await query(
        `UPDATE user_subscriptions
         SET status = $1, current_period_end = to_timestamp($2::bigint), updated_at = now()
         WHERE stripe_subscription_id = $3`,
        [status, periodEnd ?? null, sub.id],
      );
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await query(
        `UPDATE user_subscriptions
         SET status = 'cancelled', tier = 'watch', updated_at = now()
         WHERE stripe_subscription_id = $1`,
        [sub.id],
      );
      break;
    }
  }

  return Response.json({ received: true });
}
