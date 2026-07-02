import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { corsHeaders, getCorsHeaders } from "@/lib/cors";
import { PRODUCT_PRICE_MAP } from "@/lib/products";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

type CheckoutRequestBody = {
  items?: unknown;
};

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function POST(request: NextRequest) {
  const headers = getCorsHeaders(request);

  try {
    const frontendUrl = process.env.FRONTEND_URL;

    if (!frontendUrl) {
      return jsonError("FRONTEND_URL is not configured.", 500, headers);
    }

    const body = (await request.json()) as CheckoutRequestBody;

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return jsonError("Request body must include a non-empty items array.", 400, headers);
    }

    const uniqueProductIds = [...new Set(body.items)]
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);

    if (uniqueProductIds.length === 0) {
      return jsonError("Items array must contain at least one valid product ID.", 400, headers);
    }

    const unknownProductIds = uniqueProductIds.filter(
      (productId) => !(productId in PRODUCT_PRICE_MAP),
    );

    if (unknownProductIds.length > 0) {
      return jsonError(`Unknown product ID(s): ${unknownProductIds.join(", ")}`, 400, headers);
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = uniqueProductIds.map(
      (productId) => ({
        price: PRODUCT_PRICE_MAP[productId],
        quantity: 1,
      }),
    );

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${frontendUrl.replace(/\/$/, "")}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl.replace(/\/$/, "")}/cancel`,
      customer_creation: "if_required",
      metadata: {
        selected_products: JSON.stringify(uniqueProductIds),
      },
    });

    return NextResponse.json({ url: session.url }, { status: 200, headers });
  } catch (error) {
    console.error("Failed to create checkout session:", error);
    return jsonError("Unable to create checkout session.", 500, headers);
  }
}

function jsonError(message: string, status: number, headers: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers: { ...corsHeaders, ...headers } });
}
