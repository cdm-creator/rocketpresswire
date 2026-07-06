import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type DueOrderItem = {
    id: string
    order_id: string
}

type OrderItemStatus = {
    item_status: string | null
}

type OrderStatus = {
    order_status: string | null
}

const SUCCESSFUL_ITEM_STATUSES = new Set(["published", "completed"])

function unauthorizedResponse() {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
}

function isAuthorized(request: Request) {
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get("authorization")

    if (!cronSecret) {
        console.error("[update-order-statuses] Missing CRON_SECRET")
        return false
    }

    return authHeader === `Bearer ${cronSecret}`
}

export async function GET(request: Request) {
    if (!isAuthorized(request)) {
        return unauthorizedResponse()
    }

    const checkedAt = new Date().toISOString()

    try {
        const { data: dueItems, error: dueItemsError } = await supabaseAdmin
            .from("order_items")
            .select("id, order_id")
            .eq("item_status", "processing")
            .not("expected_completion_at", "is", null)
            .lte("expected_completion_at", checkedAt)
            .returns<DueOrderItem[]>()

        if (dueItemsError) {
            throw dueItemsError
        }

        if (!dueItems || dueItems.length === 0) {
            return Response.json(
                {
                    success: true,
                    checkedAt,
                    publishedItems: 0,
                    affectedOrders: 0,
                    publishedOrders: 0,
                    completedOrders: 0,
                },
                { status: 200 }
            )
        }

        const dueItemIds = dueItems.map((item) => item.id)
        const { data: publishedItems, error: publishItemsError } =
            await supabaseAdmin
                .from("order_items")
                .update({ item_status: "published" })
                .in("id", dueItemIds)
                .eq("item_status", "processing")
                .select("id, order_id")
                .returns<DueOrderItem[]>()

        if (publishItemsError) {
            throw publishItemsError
        }

        const updatedItems = publishedItems ?? []
        const updatedOrderIds = [
            ...new Set(updatedItems.map((item) => item.order_id)),
        ]
        let publishedOrders = 0
        let completedOrders = 0

        for (const orderId of updatedOrderIds) {
            const { data: orderItems, error: orderItemsError } =
                await supabaseAdmin
                    .from("order_items")
                    .select("item_status")
                    .eq("order_id", orderId)
                    .returns<OrderItemStatus[]>()

            if (orderItemsError) {
                throw orderItemsError
            }

            const statuses = (orderItems ?? []).map((item) =>
                item.item_status?.toLowerCase()
            )

            const hasProcessingItems = statuses.some(
                (status) => status === "processing"
            )
            const hasSuccessfulItems = statuses.some((status) =>
                status ? SUCCESSFUL_ITEM_STATUSES.has(status) : false
            )
            const allItemsSuccessful =
                statuses.length > 0 &&
                statuses.every((status) =>
                    status ? SUCCESSFUL_ITEM_STATUSES.has(status) : false
                )

            if (!hasSuccessfulItems) {
                continue
            }

            const nextOrderStatus = allItemsSuccessful
                ? "completed"
                : hasProcessingItems
                  ? "published"
                  : null

            if (!nextOrderStatus) {
                continue
            }

            if (nextOrderStatus === "published") {
                const { data: order, error: orderStatusError } =
                    await supabaseAdmin
                        .from("orders")
                        .select("order_status")
                        .eq("id", orderId)
                        .single()
                        .returns<OrderStatus>()

                if (orderStatusError) {
                    throw orderStatusError
                }

                if (order.order_status?.toLowerCase() === "completed") {
                    continue
                }
            }

            const { error: orderUpdateError } = await supabaseAdmin
                .from("orders")
                .update({
                    order_status: nextOrderStatus,
                    updated_at: checkedAt,
                })
                .eq("id", orderId)

            if (orderUpdateError) {
                throw orderUpdateError
            }

            if (nextOrderStatus === "completed") {
                completedOrders += 1
            }

            if (nextOrderStatus === "published") {
                publishedOrders += 1
            }
        }

        return Response.json(
            {
                success: true,
                checkedAt,
                publishedItems: updatedItems.length,
                affectedOrders: updatedOrderIds.length,
                publishedOrders,
                completedOrders,
            },
            { status: 200 }
        )
    } catch (error) {
        console.error("[update-order-statuses] Failed to update statuses", {
            checkedAt,
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return Response.json(
            { error: "Failed to update order statuses" },
            { status: 500 }
        )
    }
}
