import { supabaseAdmin } from "@/lib/supabase-admin"
import {
    ADMIN_CORS_HEADERS,
    adminOptionsResponse,
    requireVerifiedAdmin,
} from "@/lib/admin-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = ADMIN_CORS_HEADERS

type OrderItemRow = {
    id: string
    order_id: string
    product_id: string
    product_name: string
    quantity: number
    unit_amount: number
    item_status: string
    delivery_text: string | null
    published_url: string | null
    expected_completion_at: string | null
    created_at: string
}

type OrderRow = {
    id: string
    order_number: string
    customer_email: string
    customer_name: string | null
    source: string
    external_order_id: string
    amount_total: number
    currency: string
    payment_status: string
    order_status: string
    created_at: string
    updated_at: string
    order_items: OrderItemRow[] | null
}

type FormattedOrderItem = {
    id: string
    product_id: string
    product_name: string
    quantity: number
    amount: number
    unit_amount: number
    item_status: string
    delivery_text: string | null
    expected_completion_at: string | null
    published_url: string | null
}

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, {
        status,
        headers: corsHeaders,
    })
}

function serverErrorResponse() {
    return jsonResponse({ error: "Server error" }, 500)
}

function normalizeText(value: string | null | undefined) {
    return value?.trim().toLowerCase() ?? ""
}

function buildSummary(orders: OrderRow[]) {
    return orders.reduce(
        (summary, order) => {
            const orderStatus = normalizeText(order.order_status)
            const paymentStatus = normalizeText(order.payment_status)
            const source = normalizeText(order.source)

            if (orderStatus === "processing") {
                summary.processing += 1
            }

            if (orderStatus === "published") {
                summary.published += 1
            }

            if (orderStatus === "completed") {
                summary.completed += 1
            }

            if (paymentStatus === "paid") {
                summary.totalRevenue += order.amount_total ?? 0
            }

            if (source === "stripe") {
                summary.stripeOrders += 1
            }

            if (source === "thrivecart") {
                summary.thrivecartOrders += 1
            }

            return summary
        },
        {
            totalOrders: orders.length,
            processing: 0,
            published: 0,
            completed: 0,
            totalRevenue: 0,
            stripeOrders: 0,
            thrivecartOrders: 0,
        }
    )
}

function formatOrderItem(item: OrderItemRow): FormattedOrderItem {
    return {
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        amount: item.unit_amount,
        unit_amount: item.unit_amount,
        item_status: item.item_status,
        delivery_text: item.delivery_text,
        expected_completion_at: item.expected_completion_at,
        published_url: item.published_url,
    }
}

function formatOrders(orders: OrderRow[]) {
    return orders.map(({ order_items, ...order }) => ({
        ...order,
        items: (order_items ?? []).map(formatOrderItem),
    }))
}

export async function OPTIONS() {
    return adminOptionsResponse()
}

export async function GET(request: Request) {
    try {
        const { admin, response } = await requireVerifiedAdmin(
            request,
            "admin-orders"
        )

        if (response) {
            return response
        }

        const adminEmail = admin.email

        const { data, error } = await supabaseAdmin
            .from("orders")
            .select(
                `
                id,
                order_number,
                customer_email,
                customer_name,
                source,
                external_order_id,
                amount_total,
                currency,
                payment_status,
                order_status,
                created_at,
                updated_at,
                order_items (
                    id,
                    order_id,
                    product_id,
                    product_name,
                    quantity,
                    unit_amount,
                    item_status,
                    delivery_text,
                    published_url,
                    expected_completion_at,
                    created_at
                )
            `
            )
            .order("created_at", { ascending: false })
            .returns<OrderRow[]>()

        if (error) {
            console.error("[admin-orders] Failed to query orders", {
                adminEmail,
                error: error.message,
            })

            return serverErrorResponse()
        }

        const orders = data ?? []

        return jsonResponse(
            {
                admin: {
                    email: adminEmail,
                    name: admin.name,
                },
                summary: buildSummary(orders),
                orders: formatOrders(orders),
            },
            200
        )
    } catch (error) {
        console.error("[admin-orders] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
