import Stripe from "stripe"

import { buildCanonicalDeliveryByProduct } from "@/lib/product-delivery-config"
import { validatePackageSelection } from "@/lib/package-addon-rules"
import {
    isProductId,
    PRODUCT_PRICE_MAP,
    type ProductId,
} from "@/lib/products"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string)

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

function buildDeliveryMetadata(
    value: unknown,
    selectedProductIds: ProductId[]
): Record<string, string> {
    if (value !== undefined && (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value)
    )) {
        throw new Error("Invalid deliveryByProduct: expected an object.")
    }

    return buildCanonicalDeliveryByProduct(selectedProductIds)
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    })
}

export async function POST(request: Request) {
    try {
        if (!process.env.STRIPE_SECRET_KEY) {
            return Response.json(
                { error: "Missing STRIPE_SECRET_KEY" },
                { status: 500, headers: corsHeaders }
            )
        }

        if (!process.env.FRONTEND_URL) {
            return Response.json(
                { error: "Missing FRONTEND_URL" },
                { status: 500, headers: corsHeaders }
            )
        }

        const body = await request.json()
        const items = body.items

        if (!Array.isArray(items) || items.length === 0) {
            return Response.json(
                { error: "No products selected." },
                { status: 400, headers: corsHeaders }
            )
        }

        const uniqueItems = [
            ...new Set(items.map((productId) => String(productId).trim())),
        ]

        const invalidProductId = uniqueItems.find((id) => !isProductId(id))

        if (invalidProductId) {
            throw new Error(`Invalid product ID: ${invalidProductId}`)
        }

        const selectedProductIds = uniqueItems as ProductId[]
        const packageValidation = validatePackageSelection(selectedProductIds)

        if (!packageValidation.valid) {
            throw new Error("Invalid package/outlet combination.")
        }

        const line_items = selectedProductIds.map((id) => {

            const priceId = PRODUCT_PRICE_MAP[id]

            return {
                price: priceId,
                quantity: 1,
            }
        })
        const deliveryMetadata = buildDeliveryMetadata(
            body.deliveryByProduct,
            selectedProductIds
        )
        const metadata: Record<string, string> = {
            selected_products: uniqueItems.join(","),
        }

        if (Object.keys(deliveryMetadata).length > 0) {
            metadata.delivery_by_product = JSON.stringify(deliveryMetadata)
        }

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items,
            invoice_creation: {
              enabled: true,
     },
            success_url: "https://rocketpresswire.framer.website/thank-you",
            cancel_url: "https://rocketpresswire.framer.website/single-distribution",
            metadata,
        })

        return Response.json(
            { url: session.url },
            { status: 200, headers: corsHeaders }
        )
    } catch (error: any) {
        const isInvalidProductId =
            typeof error.message === "string" &&
            error.message.startsWith("Invalid product ID:")
        const isInvalidDelivery =
            typeof error.message === "string" &&
            error.message.startsWith("Invalid delivery")
        const isInvalidPackageSelection =
            error.message === "Invalid package/outlet combination."

        return Response.json(
            { error: error.message || "Checkout failed." },
            {
                status:
                    isInvalidProductId ||
                    isInvalidDelivery ||
                    isInvalidPackageSelection
                        ? 400
                        : 500,
                headers: corsHeaders,
            }
        )
    }
}
