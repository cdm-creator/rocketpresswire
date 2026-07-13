import { supabaseAdmin } from "@/lib/supabase-admin"
import {
    ADMIN_CORS_HEADERS,
    adminOptionsResponse,
} from "@/lib/admin-auth"
import {
    AdminAuthorizationError,
    requireActiveAdmin,
} from "@/lib/requireActiveAdmin"
import {
    addDaysToBusinessDate,
    getCurrentBusinessDate,
    normalizeToBusinessDate,
} from "@/lib/businessDate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = ADMIN_CORS_HEADERS
const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 18
const MAX_LIMIT = 50
const MAX_SEARCH_LENGTH = 100

const ALLOWED_ORDER_STATUSES = new Set([
    "all",
    "processing",
    "published",
    "completed",
])

const ALLOWED_ORDER_SOURCES = new Set(["all", "stripe", "thrivecart"])
const ALLOWED_DEADLINES = new Set([
    "all",
    "overdue",
    "due-today",
    "due-soon",
    "on-track",
    "none",
])

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

type SummaryOrderRow = {
    amount_total: number
    payment_status: string | null
    order_status: string | null
    source: string | null
}

type LatestOrderRow = {
    id: string
    order_number: string | null
    customer_name: string | null
    customer_email: string | null
    source: string | null
    amount_total: number | null
    currency: string | null
    created_at: string
}

type OrderIdRow = {
    order_id: string | null
}

type DeadlineItemRow = {
    id?: string | null
    order_id: string | null
    expected_completion_at: string | null
    item_status: string | null
}

type OrderFilters = {
    status: string
    source: string
    search: string
    searchOrderIds: string[]
    deadlineOrderIds: string[] | null
}

type ParsedPaginationRequest =
    | {
          page: number
          limit: number
          status: string
          source: string
          deadline: string
          search: string
      }
    | { error: string }
    | null

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, {
        status,
        headers: corsHeaders,
    })
}

function serverErrorResponse() {
    return jsonResponse({ error: "Server error" }, 500)
}

function badRequestResponse(error: string) {
    return jsonResponse({ error }, 400)
}

function normalizeText(value: string | null | undefined) {
    return value?.trim().toLowerCase() ?? ""
}

function buildSummary(
    orders: SummaryOrderRow[],
    overdueItems: number,
    overdueOrders: number
) {
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
            overdueItems,
            overdueOrders,
            totalRevenue: 0,
            stripeOrders: 0,
            thrivecartOrders: 0,
        }
    )
}

function isCompletedItemStatus(status: string | null | undefined) {
    return normalizeText(status) === "completed"
}

function isOverdueDeadlineItem(item: DeadlineItemRow, today: string) {
    const expectedDate = normalizeToBusinessDate(item.expected_completion_at)

    return Boolean(
        expectedDate &&
            expectedDate < today &&
            !isCompletedItemStatus(item.item_status)
    )
}

async function getOverdueSummaryCounts(today: string) {
    const { data, error } = await supabaseAdmin
        .from("order_items")
        .select("id,order_id,expected_completion_at,item_status")
        .not("expected_completion_at", "is", null)
        .returns<DeadlineItemRow[]>()

    if (error) {
        throw error
    }

    const overdueItems = (data ?? []).filter((item) =>
        isOverdueDeadlineItem(item, today)
    )

    return {
        overdueItems: overdueItems.length,
        overdueOrders: uniqueOrderIds(overdueItems).length,
    }
}

function parsePositiveInteger(value: string | null, fallback: number) {
    if (value === null) {
        return fallback
    }

    if (!/^\d+$/.test(value)) {
        return null
    }

    const parsedValue = Number(value)

    return parsedValue > 0 ? parsedValue : null
}

function sanitizeSearch(value: string | null) {
    return (value ?? "").trim().slice(0, MAX_SEARCH_LENGTH)
}

function sanitizePostgrestPattern(value: string) {
    return value.replace(/[%,()]/g, " ").trim()
}

function uniqueOrderIds(rows: OrderIdRow[] | null) {
    return Array.from(
        new Set(
            (rows ?? [])
                .map((row) => row.order_id)
                .filter((orderId): orderId is string => Boolean(orderId))
        )
    )
}

function applyOrderFilters(query: any, filters: OrderFilters) {
    let filteredQuery = query

    if (filters.status !== "all") {
        filteredQuery = filteredQuery.eq("order_status", filters.status)
    }

    if (filters.source !== "all") {
        filteredQuery = filteredQuery.eq("source", filters.source)
    }

    if (filters.deadlineOrderIds) {
        if (filters.deadlineOrderIds.length === 0) {
            filteredQuery = filteredQuery.in("id", [
                "00000000-0000-0000-0000-000000000000",
            ])
        } else {
            filteredQuery = filteredQuery.in("id", filters.deadlineOrderIds)
        }
    }

    if (filters.search) {
        const searchPattern = sanitizePostgrestPattern(filters.search)

        if (searchPattern) {
            const orderSearchFilters = [
                `order_number.ilike.%${searchPattern}%`,
                `external_order_id.ilike.%${searchPattern}%`,
                `customer_email.ilike.%${searchPattern}%`,
                `customer_name.ilike.%${searchPattern}%`,
            ]

            if (filters.searchOrderIds.length > 0) {
                orderSearchFilters.push(
                    `id.in.(${filters.searchOrderIds.join(",")})`
                )
            }

            filteredQuery = filteredQuery.or(orderSearchFilters.join(","))
        }
    }

    return filteredQuery
}

async function getProductSearchOrderIds(search: string) {
    if (!search) {
        return []
    }

    const searchPattern = sanitizePostgrestPattern(search)

    if (!searchPattern) {
        return []
    }

    const { data, error } = await supabaseAdmin
        .from("order_items")
        .select("order_id")
        .ilike("product_name", `%${searchPattern}%`)
        .returns<OrderIdRow[]>()

    if (error) {
        throw error
    }

    return uniqueOrderIds(data)
}

function itemMatchesDeadline(
    item: DeadlineItemRow,
    deadline: string,
    today: string
) {
    if (isCompletedItemStatus(item.item_status)) {
        return false
    }

    const expectedDate = normalizeToBusinessDate(item.expected_completion_at)

    if (deadline === "none") {
        return !expectedDate
    }

    if (!expectedDate) {
        return false
    }

    const dueSoonEndDate = addDaysToBusinessDate(today, 3)

    if (!dueSoonEndDate) {
        return false
    }

    if (deadline === "overdue") {
        return expectedDate < today
    }

    if (deadline === "due-today") {
        return expectedDate === today
    }

    if (deadline === "due-soon") {
        return expectedDate > today && expectedDate <= dueSoonEndDate
    }

    if (deadline === "on-track") {
        return expectedDate > dueSoonEndDate
    }

    return false
}

async function getDeadlineOrderIds(deadline: string, today: string) {
    if (deadline === "all") {
        return null
    }

    const { data, error } = await supabaseAdmin
        .from("order_items")
        .select("order_id,expected_completion_at,item_status")
        .returns<DeadlineItemRow[]>()

    if (error) {
        throw error
    }

    return uniqueOrderIds(
        (data ?? []).filter((item) => itemMatchesDeadline(item, deadline, today))
    )
}

function parsePaginatedRequest(request: Request): ParsedPaginationRequest {
    const url = new URL(request.url)
    const searchParams = url.searchParams
    const hasPaginationParams =
        searchParams.has("page") || searchParams.has("limit")

    if (!hasPaginationParams) {
        return null
    }

    const page = parsePositiveInteger(searchParams.get("page"), DEFAULT_PAGE)
    const limit = parsePositiveInteger(searchParams.get("limit"), DEFAULT_LIMIT)

    if (page === null || limit === null || limit > MAX_LIMIT) {
        return { error: "Invalid pagination parameters" }
    }

    const status = normalizeText(searchParams.get("status") ?? "all")
    const source = normalizeText(searchParams.get("source") ?? "all")
    const deadline = normalizeText(searchParams.get("deadline") ?? "all")

    if (
        !ALLOWED_ORDER_STATUSES.has(status) ||
        !ALLOWED_ORDER_SOURCES.has(source) ||
        !ALLOWED_DEADLINES.has(deadline)
    ) {
        return { error: "Invalid filter parameters" }
    }

    return {
        page,
        limit,
        status,
        source,
        deadline,
        search: sanitizeSearch(searchParams.get("search")),
    }
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
        const activeAdmin = await requireActiveAdmin(request)

        const adminEmail = activeAdmin.email
        const paginationRequest = parsePaginatedRequest(request)

        if (paginationRequest && "error" in paginationRequest) {
            return badRequestResponse(paginationRequest.error)
        }

        const businessToday = getCurrentBusinessDate()

        if (paginationRequest) {
            const overdueSummary = await getOverdueSummaryCounts(businessToday)
            const searchOrderIds = await getProductSearchOrderIds(
                paginationRequest.search
            )
            const deadlineOrderIds = await getDeadlineOrderIds(
                paginationRequest.deadline,
                businessToday
            )
            const filters: OrderFilters = {
                status: paginationRequest.status,
                source: paginationRequest.source,
                search: paginationRequest.search,
                searchOrderIds,
                deadlineOrderIds,
            }

            const countQuery = applyOrderFilters(
                supabaseAdmin
                    .from("orders")
                    .select("id", { count: "exact", head: true }),
                filters
            )
            const { count, error: countError } = await countQuery

            if (countError) {
                console.error("[admin-orders] Failed to count orders", {
                    adminEmail,
                    error: countError.message,
                })

                return serverErrorResponse()
            }

            const total = count ?? 0
            const totalPages = Math.max(
                1,
                Math.ceil(total / paginationRequest.limit)
            )
            const from = (paginationRequest.page - 1) * paginationRequest.limit
            const to = from + paginationRequest.limit - 1

            const ordersQuery = applyOrderFilters(
                supabaseAdmin
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
                    ),
                filters
            )

            const { data, error } = await ordersQuery
                .order("created_at", { ascending: false })
                .range(from, to)

            if (error) {
                console.error("[admin-orders] Failed to query orders", {
                    adminEmail,
                    error: error.message,
                })

                return serverErrorResponse()
            }

            const { data: summaryRows, error: summaryError } =
                await supabaseAdmin
                    .from("orders")
                    .select("amount_total,payment_status,order_status,source")
                    .returns<SummaryOrderRow[]>()

            if (summaryError) {
                console.error("[admin-orders] Failed to query summary", {
                    adminEmail,
                    error: summaryError.message,
                })

                return serverErrorResponse()
            }

            const { data: latestOrder, error: latestOrderError } =
                await supabaseAdmin
                    .from("orders")
                    .select(
                        "id,order_number,customer_name,customer_email,source,amount_total,currency,created_at"
                    )
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle<LatestOrderRow>()

            if (latestOrderError) {
                console.error("[admin-orders] Failed to query latest order", {
                    adminEmail,
                    error: latestOrderError.message,
                })

                return serverErrorResponse()
            }

            return jsonResponse(
                {
                    admin: {
                        email: adminEmail,
                        name: activeAdmin.admin.name,
                    },
                    summary: buildSummary(
                        summaryRows ?? [],
                        overdueSummary.overdueItems,
                        overdueSummary.overdueOrders
                    ),
                    orders: formatOrders((data ?? []) as OrderRow[]),
                    pagination: {
                        page: paginationRequest.page,
                        limit: paginationRequest.limit,
                        total,
                        totalPages,
                        hasNextPage: paginationRequest.page < totalPages,
                        hasPreviousPage: paginationRequest.page > 1,
                    },
                    latestOrder,
                },
                200
            )
        }

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
        const overdueSummary = await getOverdueSummaryCounts(businessToday)

        return jsonResponse(
            {
                admin: {
                    email: adminEmail,
                    name: activeAdmin.admin.name,
                },
                summary: buildSummary(
                    orders,
                    overdueSummary.overdueItems,
                    overdueSummary.overdueOrders
                ),
                orders: formatOrders(orders),
            },
            200
        )
    } catch (error) {
        if (error instanceof AdminAuthorizationError) {
            return jsonResponse({ error: error.message }, error.status)
        }

        console.error("[admin-orders] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
