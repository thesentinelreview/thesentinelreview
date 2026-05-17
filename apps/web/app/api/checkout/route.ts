import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { priceId } = (await req.json()) as { priceId: string };
  if (!priceId) {
    return Response.json({ error: "priceId required" }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    customer_email: (sessionClaims?.email as string | undefined) ?? undefined,
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/app?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing`,
  });

  return Response.json({ url: session.url });
}
