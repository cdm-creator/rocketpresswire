import Stripe from "stripe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string)

const PRODUCT_PRICE_MAP: Record<string, string> = {
    msn: "price_1ToioORtNm75vIFItIQYFEm7",
    reuters: "price_1ToiyORtNm75vIFInjjJeQxF",
}

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

        const uniqueItems = [...new Set(items)]

        const line_items = uniqueItems.map((productId) => {
            const id = String(productId).trim()
            const priceId = PRODUCT_PRICE_MAP[id]

            if (!priceId) {
                throw new Error(`Invalid product ID: ${id}`)
            }

            return {
                price: priceId,
                quantity: 1,
            }
        })

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items,
            success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/cancel`,
            metadata: {
                selected_products: uniqueItems.join(","),
            },
        })

        return Response.json(
            { url: session.url },
            { status: 200, headers: corsHeaders }
        )
    } catch (error: any) {
        return Response.json(
            { error: error.message || "Checkout failed." },
            { status: 500, headers: corsHeaders }
        )
    }
}