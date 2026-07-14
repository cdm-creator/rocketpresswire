import { supabaseAdmin } from "@/lib/supabase-admin"
import {
    ADMIN_CORS_HEADERS,
    adminOptionsResponse,
} from "@/lib/admin-auth"
import {
    AdminAuthorizationError,
    requireActiveAdmin,
} from "@/lib/requireActiveAdmin"
import { businessDateToUtcNoonISOString } from "@/lib/businessDate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = ADMIN_CORS_HEADERS

const ALLOWED_ITEM_STATUSES = new Set([
    "processing",
    "published",
    "completed",
])
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type RouteContext = {
    params: Promise<{
        itemId?: string
    }>
}

type OrderItemRow = {
    id: string
    order_id: string
    item_status: string
    published_url: string | null
    expected_completion_at: string | null
}

type OrderItemStatusRow = {
    item_status: string | null
}

type UpdatedOrderRow = {
    id: string
    order_status: string
}

type RequestBody = {
    item_status?: unknown
    published_url?: unknown
    expected_completion_at?: unknown
}

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, {
        status,
        headers: corsHeaders,
    })
}

function badRequestResponse(error: string) {
    return jsonResponse({ error }, 400)
}

function notFoundResponse() {
    return jsonResponse({ error: "Order item not found" }, 404)
}

function serverErrorResponse() {
    return jsonResponse({ error: "Server error" }, 500)
}

function normalizeText(value: string | null | undefined) {
    return value?.trim().toLowerCase() ?? ""
}

function normalizePublishedUrl(value: unknown) {
    if (value === null) {
        return null
    }

    if (typeof value !== "string") {
        return undefined
    }

    const trimmedValue = value.trim()

    return trimmedValue === "" ? null : trimmedValue
}

function normalizeExpectedCompletionAt(value: unknown) {
    if (value === null) {
        return null
    }

    if (typeof value !== "string") {
        return undefined
    }

    const trimmedValue = value.trim()

    if (DATE_ONLY_PATTERN.test(trimmedValue)) {
        return businessDateToUtcNoonISOString(trimmedValue) ?? undefined
    }

    const date = new Date(trimmedValue)

    if (!trimmedValue || Number.isNaN(date.getTime())) {
        return undefined
    }

    return date.toISOString()
}

function deriveOrderStatus(items: OrderItemStatusRow[]) {
    const statuses = items.map((item) => normalizeText(item.item_status))

    if (
        statuses.length > 0 &&
        statuses.every((status) => status === "completed")
    ) {
        return "completed"
    }

    if (
        statuses.some(
            (status) => status === "published" || status === "completed"
        ) &&
        statuses.some((status) => status !== "completed")
    ) {
        return "published"
    }

    return "processing"
}

export async function OPTIONS() {
    return adminOptionsResponse()
}

export async function PATCH(request: Request, context: RouteContext) {
    try {
        await requireActiveAdmin(request)

        const { itemId } = await context.params

        if (!itemId) {
            return badRequestResponse("Missing item ID")
        }

        let body: RequestBody

        try {
            body = (await request.json()) as RequestBody
        } catch {
            return badRequestResponse("Invalid body")
        }

        if (typeof body.item_status !== "string") {
            return badRequestResponse("Invalid item status")
        }

        const itemStatus = normalizeText(body.item_status)

        if (!ALLOWED_ITEM_STATUSES.has(itemStatus)) {
            return badRequestResponse("Invalid item status")
        }

        const hasPublishedUrl = Object.hasOwn(body, "published_url")
        const publishedUrl = hasPublishedUrl
            ? normalizePublishedUrl(body.published_url)
            : undefined

        if (hasPublishedUrl && publishedUrl === undefined) {
            return badRequestResponse("Invalid body")
        }

        const hasExpectedCompletionAt = Object.hasOwn(
            body,
            "expected_completion_at"
        )
        const expectedCompletionAt = hasExpectedCompletionAt
            ? normalizeExpectedCompletionAt(body.expected_completion_at)
            : undefined

        if (hasExpectedCompletionAt && expectedCompletionAt === undefined) {
            return badRequestResponse("Invalid expected completion date")
        }

        const { data: currentItem, error: currentItemError } =
            await supabaseAdmin
                .from("order_items")
                .select(
                    "id, order_id, item_status, published_url, expected_completion_at"
                )
                .eq("id", itemId)
                .maybeSingle()
                .returns<OrderItemRow | null>()

        if (currentItemError) {
            console.error("[admin-order-items] Failed to read order item", {
                itemId,
                error: currentItemError.message,
            })

            return serverErrorResponse()
        }

        if (!currentItem) {
            return notFoundResponse()
        }

        const itemUpdate: {
            item_status: string
            published_url?: string | null
            expected_completion_at?: string | null
        } = {
            item_status: itemStatus,
        }

        if (hasPublishedUrl) {
            itemUpdate.published_url = publishedUrl
        }

        if (hasExpectedCompletionAt) {
            itemUpdate.expected_completion_at = expectedCompletionAt
        }

        const { data: updatedItem, error: updateItemError } =
            await supabaseAdmin
                .from("order_items")
                .update(itemUpdate)
                .eq("id", currentItem.id)
                .select(
                    "id, order_id, item_status, published_url, expected_completion_at"
                )
                .single()
                .returns<OrderItemRow>()

        if (updateItemError) {
            console.error("[admin-order-items] Failed to update order item", {
                itemId,
                error: updateItemError.message,
            })

            return serverErrorResponse()
        }

        const { data: orderItems, error: orderItemsError } =
            await supabaseAdmin
                .from("order_items")
                .select("item_status")
                .eq("order_id", updatedItem.order_id)
                .returns<OrderItemStatusRow[]>()

        if (orderItemsError) {
            console.error("[admin-order-items] Failed to read order items", {
                orderId: updatedItem.order_id,
                error: orderItemsError.message,
            })

            return serverErrorResponse()
        }

        const nextOrderStatus = deriveOrderStatus(orderItems ?? [])

        const { data: updatedOrder, error: updateOrderError } =
            await supabaseAdmin
                .from("orders")
                .update({
                    order_status: nextOrderStatus,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", updatedItem.order_id)
                .select("id, order_status")
                .single()
                .returns<UpdatedOrderRow>()

        if (updateOrderError) {
            console.error("[admin-order-items] Failed to update order", {
                orderId: updatedItem.order_id,
                error: updateOrderError.message,
            })

            return serverErrorResponse()
        }

        return jsonResponse(
            {
                success: true,
                item: {
                    id: updatedItem.id,
                    order_id: updatedItem.order_id,
                    item_status: updatedItem.item_status,
                    published_url: updatedItem.published_url,
                    expected_completion_at: updatedItem.expected_completion_at,
                },
                order: {
                    id: updatedOrder.id,
                    order_status: updatedOrder.order_status,
                },
            },
            200
        )
    } catch (error) {
        if (error instanceof AdminAuthorizationError) {
            return jsonResponse({ error: error.message }, error.status)
        }

        console.error("[admin-order-items] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
