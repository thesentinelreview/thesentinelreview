import Stripe from "stripe";
import { execute, query } from "@/lib/db";
import { tierForPriceIds } from "@/lib/stripe";

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

  // Idempotency: claim the event under a unique constraint so duplicate /
  // replayed deliveries of the SAME event become no-ops. If processing then
  // fails, we release the claim (below) so Stripe's retry re-processes it
  // rather than being skipped.
  const claimed = await execute(
    `INSERT INTO processed_stripe_events (event_id, event_type)
     VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING`,
    [event.id, event.type],
  );
  if (claimed === 0) {
    return Response.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserId = session.client_reference_id;
        if (!clerkUserId || !session.subscription) break;

        const sub = await stripe.subscriptions.retrieve(session.subscription as string, {
          expand: ["items.data.price"],
        });
        const priceIds = sub.items.data
          .map((it) => it.price?.id)
          .filter((x): x is string => !!x);
        const tier = tierForPriceIds(priceIds);
        if (!tier) break;

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
          [clerkUserId, session.customer, session.subscription, tier, periodEnd],
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
        const priceIds = sub.items.data
          .map((it) => it.price?.id)
          .filter((x): x is string => !!x);
        const tier = tierForPriceIds(priceIds);

        if (tier) {
          await query(
            `UPDATE user_subscriptions
             SET status = $1, current_period_end = to_timestamp($2), tier = $3, updated_at = now()
             WHERE stripe_subscription_id = $4`,
            [status, periodEnd, tier, sub.id],
          );
        } else {
          await query(
            `UPDATE user_subscriptions
             SET status = $1, current_period_end = to_timestamp($2), updated_at = now()
             WHERE stripe_subscription_id = $3`,
            [status, periodEnd, sub.id],
          );
        }
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
  } catch (err) {
    await execute(`DELETE FROM processed_stripe_events WHERE event_id = $1`, [event.id]);
    throw err;
  }

  return Response.json({ received: true });
}
