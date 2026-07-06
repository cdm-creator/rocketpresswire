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
                    completedItems: 0,
                    affectedOrders: 0,
                    completedOrders: 0,
                },
                { status: 200 }
            )
        }

        const dueItemIds = dueItems.map((item) => item.id)
        const affectedOrderIds = [
            ...new Set(dueItems.map((item) => item.order_id)),
        ]

        const { data: completedItems, error: completeItemsError } =
            await supabaseAdmin
                .from("order_items")
                .update({ item_status: "completed" })
                .in("id", dueItemIds)
                .eq("item_status", "processing")
                .select("id, order_id")
                .returns<DueOrderItem[]>()

        if (completeItemsError) {
            throw completeItemsError
        }

        const updatedItems = completedItems ?? []
        const updatedOrderIds = [
            ...new Set(updatedItems.map((item) => item.order_id)),
        ]
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

            const hasProcessingItems = (orderItems ?? []).some(
                (item) => item.item_status?.toLowerCase() === "processing"
            )

            if (hasProcessingItems) {
                continue
            }

            const { error: orderUpdateError } = await supabaseAdmin
                .from("orders")
                .update({
                    order_status: "completed",
                    updated_at: checkedAt,
                })
                .eq("id", orderId)

            if (orderUpdateError) {
                throw orderUpdateError
            }

            completedOrders += 1
        }

        return Response.json(
            {
                success: true,
                checkedAt,
                completedItems: updatedItems.length,
                affectedOrders: affectedOrderIds.length,
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
