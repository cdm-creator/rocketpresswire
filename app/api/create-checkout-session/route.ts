import Stripe from "stripe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string)

const PRODUCT_PRICE_MAP: Record<string, string> = {
    msn: "price_1Tq8bFRvo61AD2cgV6by04aS",
    reuters: "price_1Tq8cPRvo61AD2cgeWCTcRyd",
    openPR:"price_1Tq8csRvo61AD2cgaOaDm646",
    core: "price_1TsxfzRvo61AD2cgCeCRxiJB",
    growth: "price_1TsxgZRvo61AD2cg4Q2t2Yv8",
    premium: "price_1Tsxh2Rvo61AD2cgU3FfoNYE",
    enterprise: "price_1TsxheRvo61AD2cgfOqfW44W",
    morningstar: "price_1TsxrCRvo61AD2cgEWqMfI66",
    apple_news: "price_1TsxxmRvo61AD2cg2TMuv2yl",
    big_news_network: "price_1TsxvFRvo61AD2cgSqKisJd6",
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
            invoice_creation: {
              enabled: true,
     },
            success_url: "https://rocketpresswire.framer.website/thank-you",
            cancel_url: "https://rocketpresswire.framer.website/single-distribution",
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
