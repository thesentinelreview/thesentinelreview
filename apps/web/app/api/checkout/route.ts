import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { tierForPriceId } from "@/lib/stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
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

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      customer_email: (sessionClaims?.email as string | undefined) ?? undefined,
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/activate?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    console.error("[checkout] Stripe error", err);
    return Response.json({ error: "Failed to create checkout session" }, { status: 502 });
  }
}
