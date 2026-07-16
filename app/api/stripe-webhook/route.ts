import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createOrderFromPayment } from "@/lib/create-order-from-payment";
import { PRODUCT_NAME_MAP, PRODUCT_PRICE_MAP } from "@/lib/products";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

const SUPPORTED_PRODUCT_IDS = new Set(Object.keys(PRODUCT_NAME_MAP));
const PRODUCT_ID_BY_PRICE_ID = new Map(
  Object.entries(PRODUCT_PRICE_MAP).map(([productId, priceId]) => [priceId, productId]),
);

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
      const customerEmail = (
        session.customer_details?.email ??
        session.customer_email ??
        ""
      )
        .trim()
        .toLowerCase();
      const customerName = session.customer_details?.name?.trim() || null;

      if (!customerEmail) {
        console.error("[stripe-webhook] Missing customer email", {
          eventId: event.id,
          sessionId: session.id,
        });

        return NextResponse.json({ error: "Missing customer email." }, { status: 400 });
      }

      const lineItems = await getStripe().checkout.sessions.listLineItems(session.id, {
        limit: 100,
        expand: ["data.price"],
      });
      const purchasedItems = buildPurchasedItems(session, lineItems.data);

      if (purchasedItems.length === 0) {
        console.error("[stripe-webhook] Missing selected products", {
          eventId: event.id,
          sessionId: session.id,
        });

        return NextResponse.json({ error: "Missing selected products." }, { status: 400 });
      }

      const amountTotal =
        session.amount_total ??
        purchasedItems.reduce(
          (total, item) => total + item.unitAmount * item.quantity,
          0,
        );
      const currency = (
        session.currency ??
        lineItems.data.find((item) => item.currency)?.currency ??
        "usd"
      ).toLowerCase();

      const result = await createOrderFromPayment({
        source: "stripe",
        externalOrderId: session.id,
        customerEmail,
        customerName,
        amountTotal,
        currency,
        purchasedItems,
      });

      if (result.duplicate) {
        console.log("[stripe-webhook] Duplicate order skipped", {
          eventId: event.id,
          sessionId: session.id,
        });
      } else {
        console.log("[stripe-webhook] Order created", {
          eventId: event.id,
          sessionId: session.id,
          orderId: result.orderId,
          itemCount: result.itemCount,
        });
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Stripe webhook processing failed:", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
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

function isSupportedProductId(productId: string) {
  return SUPPORTED_PRODUCT_IDS.has(productId);
}

function getUnitAmount(lineItem: Stripe.LineItem | undefined) {
  if (!lineItem) {
    return 0;
  }

  if (lineItem.price?.unit_amount !== null && lineItem.price?.unit_amount !== undefined) {
    return lineItem.price.unit_amount;
  }

  const quantity = lineItem.quantity ?? 1;

  if (lineItem.amount_total !== null && lineItem.amount_total !== undefined && quantity > 0) {
    return Math.round(lineItem.amount_total / quantity);
  }

  return 0;
}

function inferProductIdsFromLineItems(lineItems: Stripe.LineItem[]) {
  return lineItems
    .map((lineItem) => {
      const priceId = lineItem.price?.id;

      return priceId ? PRODUCT_ID_BY_PRICE_ID.get(priceId) : undefined;
    })
    .filter((productId): productId is string => Boolean(productId));
}

function buildPurchasedItems(
  session: Stripe.Checkout.Session,
  lineItems: Stripe.LineItem[],
) {
  const metadataProductIds = parseSelectedProducts(session.metadata?.selected_products);
  const productIds =
    metadataProductIds.length > 0
      ? metadataProductIds
      : inferProductIdsFromLineItems(lineItems);

  return [...new Set(productIds)]
    .filter(isSupportedProductId)
    .map((productId) => {
      const priceId = PRODUCT_PRICE_MAP[productId];
      const lineItem = lineItems.find((item) => item.price?.id === priceId);
      const quantity = lineItem?.quantity ?? 1;

      return {
        productId,
        productName: PRODUCT_NAME_MAP[productId] ?? productId,
        quantity,
        unitAmount: getUnitAmount(lineItem),
      };
    })
    .filter(
      (item) =>
        item.productId &&
        item.productName &&
        Number.isFinite(item.quantity) &&
        Number.isFinite(item.unitAmount),
    );
}
