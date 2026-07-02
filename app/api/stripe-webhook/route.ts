import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { sendAdminOrderEmail } from "@/lib/email";
import { appendOrderToSheet } from "@/lib/googleSheets";
import { PRODUCT_NAME_MAP } from "@/lib/products";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not configured." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const order = buildOrderFromSession(session);

      await appendOrderToSheet(order);
      await sendAdminOrderEmail(order);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Stripe webhook processing failed:", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}

function buildOrderFromSession(session: Stripe.Checkout.Session) {
  const selectedProductIds = parseSelectedProducts(session.metadata?.selected_products);
  const selectedProducts = selectedProductIds.map(
    (productId) => PRODUCT_NAME_MAP[productId] ?? productId,
  );

  return {
    orderDate: new Date().toISOString(),
    stripeSessionId: session.id,
    customerEmail: session.customer_details?.email ?? session.customer_email ?? "",
    customerName: session.customer_details?.name ?? "",
    selectedProducts,
    amountTotal: session.amount_total ?? 0,
    currency: (session.currency ?? "").toUpperCase(),
    paymentStatus: session.payment_status,
  };
}

function parseSelectedProducts(value: string | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
