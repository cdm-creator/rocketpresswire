import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = {
    "Access-Control-Allow-Origin":
        "https://rocketpresswire.framer.website",

    "Access-Control-Allow-Methods": "GET, OPTIONS",

    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

type OrderItemRow = {
    id: string
    product_id: string
    product_name: string
    quantity: number
    unit_amount: number
    item_status: string
    delivery_text: string | null
    published_url: string | null
    expected_completion_at: string | null
}

type OrderRow = {
    id: string
    order_number: string
    customer_name: string | null
    source: string
    external_order_id: string
    amount_total: number
    currency: string
    payment_status: string
    order_status: string
    created_at: string
    order_items: OrderItemRow[] | null
}

function unauthorizedResponse() {
    return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
    )
}

function getBearerToken(request: Request) {
    const authorization = request.headers.get("authorization")

    if (!authorization) {
        return null
    }

    const [scheme, token] = authorization.split(" ")

    if (scheme !== "Bearer" || !token) {
        return null
    }

    return token.trim() || null
}

function buildSummary(orders: OrderRow[]) {
    return orders.reduce(
        (summary, order) => {
            const status = order.order_status?.toLowerCase()

            if (status === "processing") {
                summary.processing += 1
            }

            if (status === "published") {
                summary.published += 1
            }

            if (status === "completed") {
                summary.completed += 1
            }

            return summary
        },
        {
            totalOrders: orders.length,
            processing: 0,
            published: 0,
            completed: 0,
        }
    )
}

function formatOrders(orders: OrderRow[]) {
    return orders.map(({ order_items, ...order }) => ({
        ...order,
        items: order_items ?? [],
    }))
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    })
}

export async function GET(request: Request) {
    const accessToken = getBearerToken(request)

    if (!accessToken) {
        return unauthorizedResponse()
    }

    try {
        const {
            data: { user },
            error: authError,
        } = await supabaseAdmin.auth.getUser(accessToken)

        if (authError || !user) {
            return unauthorizedResponse()
        }

        const customerEmail = user.email?.trim().toLowerCase()

        if (!customerEmail) {
            return unauthorizedResponse()
        }

        const { data, error } = await supabaseAdmin
            .from("orders")
            .select(
                `
                id,
                order_number,
                customer_name,
                source,
                external_order_id,
                amount_total,
                currency,
                payment_status,
                order_status,
                created_at,
                order_items (
                    id,
                    product_id,
                    product_name,
                    quantity,
                    unit_amount,
                    item_status,
                    delivery_text,
                    published_url,
                    expected_completion_at
                )
            `
            )
            .eq("customer_email", customerEmail)
            .order("created_at", { ascending: false })
            .returns<OrderRow[]>()

        if (error) {
            console.error("[my-orders] Failed to query orders", {
                customerEmail,
                error: error.message,
            })

            return Response.json(
                { error: "Failed to load orders" },
                { status: 500, headers: corsHeaders }
            )
        }

        const orders = data ?? []

        return Response.json(
            {
                user: {
                    email: customerEmail,
                },
                summary: buildSummary(orders),
                orders: formatOrders(orders),
            },
            { status: 200, headers: corsHeaders }
        )
    } catch (error) {
        console.error("[my-orders] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return Response.json(
            { error: "Server error" },
            { status: 500, headers: corsHeaders }
        )
    }
}
