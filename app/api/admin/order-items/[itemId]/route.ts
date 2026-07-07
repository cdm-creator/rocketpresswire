import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = {
    "Access-Control-Allow-Origin":
        "https://rocketpresswire.framer.website",

    "Access-Control-Allow-Methods":
        "PATCH, OPTIONS",

    "Access-Control-Allow-Headers":
        "Content-Type, Authorization",
}

const ALLOWED_ITEM_STATUSES = new Set([
    "processing",
    "published",
    "completed",
])

type RouteContext = {
    params: Promise<{
        itemId?: string
    }>
}

type AdminUserRow = {
    email: string
}

type OrderItemRow = {
    id: string
    order_id: string
    item_status: string
    published_url: string | null
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

function unauthorizedResponse() {
    return jsonResponse({ error: "Unauthorized" }, 401)
}

function forbiddenResponse() {
    return jsonResponse({ error: "Forbidden" }, 403)
}

function notFoundResponse() {
    return jsonResponse({ error: "Order item not found" }, 404)
}

function serverErrorResponse() {
    return jsonResponse({ error: "Server error" }, 500)
}

function getBearerToken(request: Request) {
    const authorization = request.headers.get("authorization")

    if (!authorization) {
        return null
    }

    const parts = authorization.split(" ")

    if (parts.length !== 2) {
        return null
    }

    const [scheme, token] = parts

    if (scheme !== "Bearer" || !token) {
        return null
    }

    return token.trim() || null
}

function normalizeText(value: string | null | undefined) {
    return value?.trim().toLowerCase() ?? ""
}

function escapeLikePattern(value: string) {
    return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
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

async function requireActiveAdmin(request: Request) {
    const accessToken = getBearerToken(request)

    if (!accessToken) {
        return { response: unauthorizedResponse() }
    }

    const {
        data: { user },
        error: authError,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (authError || !user) {
        return { response: unauthorizedResponse() }
    }

    const adminEmail = normalizeText(user.email)

    if (!adminEmail) {
        return { response: unauthorizedResponse() }
    }

    const { data: adminUsers, error: adminError } = await supabaseAdmin
        .from("admin_users")
        .select("email")
        .eq("is_active", true)
        .ilike("email", escapeLikePattern(adminEmail))
        .limit(1)
        .returns<AdminUserRow[]>()

    if (adminError) {
        console.error("[admin-order-items] Failed to query admin_users", {
            adminEmail,
            error: adminError.message,
        })

        return { response: serverErrorResponse() }
    }

    const admin = adminUsers?.find(
        (adminUser) => normalizeText(adminUser.email) === adminEmail
    )

    if (!admin) {
        return { response: forbiddenResponse() }
    }

    return { adminEmail }
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    })
}

export async function PATCH(request: Request, context: RouteContext) {
    try {
        const { response } = await requireActiveAdmin(request)

        if (response) {
            return response
        }

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

        const { data: currentItem, error: currentItemError } =
            await supabaseAdmin
                .from("order_items")
                .select("id, order_id, item_status, published_url")
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
        } = {
            item_status: itemStatus,
        }

        if (hasPublishedUrl) {
            itemUpdate.published_url = publishedUrl
        }

        const { data: updatedItem, error: updateItemError } =
            await supabaseAdmin
                .from("order_items")
                .update(itemUpdate)
                .eq("id", currentItem.id)
                .select("id, order_id, item_status, published_url")
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
                },
                order: {
                    id: updatedOrder.id,
                    order_status: updatedOrder.order_status,
                },
            },
            200
        )
    } catch (error) {
        console.error("[admin-order-items] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
