import { ADMIN_CORS_HEADERS, adminOptionsResponse } from "@/lib/admin-auth"
import {
    AdminAuthorizationError,
    requireActiveAdmin,
} from "@/lib/requireActiveAdmin"
import { getCurrentBusinessDate, normalizeToBusinessDate } from "@/lib/businessDate"
import {
    createOrderExportWorkbook,
    getMatchingOrderReleases,
} from "@/lib/order-export"
import type {
    OrderExportOrder,
    OrderExportRelease,
} from "@/lib/order-export"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { GET as getAdminOrders } from "../route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EXPORT_PAGE_SIZE = 50
const MAX_EXPORT_ORDERS = 10_000
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type ExportMode = "filtered" | "this-month" | "custom"

type ExportOrder = OrderExportOrder

type OrdersPageResponse = {
    orders?: ExportOrder[]
    pagination?: {
        page?: number
        totalPages?: number
        total?: number
    }
    error?: string
}

type ReleaseRow = OrderExportRelease

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, {
        status,
        headers: ADMIN_CORS_HEADERS,
    })
}

function normalizeText(value: string | null | undefined) {
    return String(value || "").trim().toLowerCase()
}

function isValidDateOnly(value: string) {
    return DATE_ONLY_PATTERN.test(value) && normalizeToBusinessDate(value) === value
}

function getExportMode(value: string | null): ExportMode | null {
    if (value === "filtered" || value === "this-month" || value === "custom") {
        return value
    }

    return null
}

async function loadFilteredOrders(request: Request, searchParams: URLSearchParams) {
    const authorization = request.headers.get("authorization") || ""
    const orders: ExportOrder[] = []
    let page = 1
    let totalPages = 1

    do {
        const pageParams = new URLSearchParams()
        pageParams.set("page", String(page))
        pageParams.set("limit", String(EXPORT_PAGE_SIZE))

        for (const key of ["status", "deadline", "search"] as const) {
            const value = searchParams.get(key)?.trim()
            if (value && value !== "all") pageParams.set(key, value)
        }

        const pageRequest = new Request(
            `http://rocket-press-wire.internal/api/admin/orders?${pageParams.toString()}`,
            {
                method: "GET",
                headers: {
                    Authorization: authorization,
                    "Content-Type": "application/json",
                },
            }
        )
        const response = await getAdminOrders(pageRequest)
        const json = (await response.json().catch(() => null)) as
            | OrdersPageResponse
            | null

        if (!response.ok) {
            return {
                response: jsonResponse(
                    { error: json?.error || "Unable to load orders for export" },
                    response.status
                ),
            }
        }

        orders.push(...(json?.orders ?? []))
        totalPages = Math.max(1, Number(json?.pagination?.totalPages || 1))
        page += 1

        if (orders.length > MAX_EXPORT_ORDERS) {
            return {
                response: jsonResponse(
                    { error: `Export is limited to ${MAX_EXPORT_ORDERS} orders` },
                    400
                ),
            }
        }
    } while (page <= totalPages)

    return { orders }
}

function applyDateRange(
    orders: ExportOrder[],
    mode: ExportMode,
    startDate: string,
    endDate: string
) {
    if (mode === "filtered") return orders

    const businessToday = getCurrentBusinessDate()
    const rangeStart =
        mode === "this-month" ? `${businessToday.slice(0, 7)}-01` : startDate
    const rangeEnd = mode === "this-month" ? businessToday : endDate

    return orders.filter((order) => {
        const orderDate = normalizeToBusinessDate(order.created_at)
        return Boolean(orderDate && orderDate >= rangeStart && orderDate <= rangeEnd)
    })
}

export async function OPTIONS() {
    return adminOptionsResponse()
}

export async function GET(request: Request) {
    try {
        await requireActiveAdmin(request)

        const url = new URL(request.url)
        const mode = getExportMode(url.searchParams.get("mode"))
        const releaseStatus = normalizeText(
            url.searchParams.get("release_status") || "all"
        )
        const startDate = url.searchParams.get("start")?.trim() || ""
        const endDate = url.searchParams.get("end")?.trim() || ""

        if (!mode) return jsonResponse({ error: "Invalid export mode" }, 400)

        if (!new Set(["all", "pending", "received"]).has(releaseStatus)) {
            return jsonResponse({ error: "Invalid release status" }, 400)
        }

        if (
            mode === "custom" &&
            (!isValidDateOnly(startDate) ||
                !isValidDateOnly(endDate) ||
                startDate > endDate)
        ) {
            return jsonResponse({ error: "Invalid custom date range" }, 400)
        }

        const loaded = await loadFilteredOrders(request, url.searchParams)
        if ("response" in loaded) return loaded.response

        const { data: releases, error: releasesError } = await supabaseAdmin
            .from("press_releases")
            .select("order_number,status,admin_status,created_at,updated_at")
            .returns<ReleaseRow[]>()

        if (releasesError) {
            console.error("[admin-orders-export] Failed to load releases", {
                error: releasesError.message,
            })
            return jsonResponse({ error: "Unable to export orders" }, 500)
        }

        let orders = applyDateRange(
            loaded.orders,
            mode,
            startDate,
            endDate
        )
        const releaseRows = releases ?? []

        if (releaseStatus !== "all") {
            orders = orders.filter((order) => {
                const hasRelease =
                    getMatchingOrderReleases(order, releaseRows).length > 0
                return releaseStatus === "received" ? hasRelease : !hasRelease
            })
        }

        const workbook = createOrderExportWorkbook(orders, releaseRows)
        const buffer = await workbook.xlsx.writeBuffer()
        const fileDate = getCurrentBusinessDate()

        return new Response(new Uint8Array(buffer), {
            status: 200,
            headers: {
                ...ADMIN_CORS_HEADERS,
                "Content-Type":
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="rocket-press-wire-orders-${fileDate}.xlsx"`,
                "Access-Control-Expose-Headers": "Content-Disposition",
                "Cache-Control": "no-store, no-cache, must-revalidate",
            },
        })
    } catch (error) {
        if (error instanceof AdminAuthorizationError) {
            return jsonResponse({ error: error.message }, error.status)
        }

        console.error("[admin-orders-export] Export failed", {
            error: error instanceof Error ? error.message : "Unknown error",
        })
        return jsonResponse({ error: "Unable to export orders" }, 500)
    }
}
