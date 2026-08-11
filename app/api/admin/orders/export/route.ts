import ExcelJS from "exceljs"
import { ADMIN_CORS_HEADERS, adminOptionsResponse } from "@/lib/admin-auth"
import {
    AdminAuthorizationError,
    requireActiveAdmin,
} from "@/lib/requireActiveAdmin"
import { getCurrentBusinessDate, normalizeToBusinessDate } from "@/lib/businessDate"
import { PACKAGE_IDS } from "@/lib/products"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { GET as getAdminOrders } from "../route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EXPORT_PAGE_SIZE = 50
const MAX_EXPORT_ORDERS = 10_000
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PACKAGE_ID_SET = new Set<string>(PACKAGE_IDS)

type ExportMode = "filtered" | "this-month" | "custom"

type ExportOrderItem = {
    product_id?: string | null
    product_name?: string | null
    item_status?: string | null
    expected_completion_at?: string | null
}

type ExportOrder = {
    id: string
    order_number?: string | null
    external_order_id?: string | null
    customer_name?: string | null
    customer_email?: string | null
    amount_total?: number | null
    currency?: string | null
    payment_status?: string | null
    order_status?: string | null
    created_at: string
    updated_at?: string | null
    items?: ExportOrderItem[] | null
}

type OrdersPageResponse = {
    orders?: ExportOrder[]
    pagination?: {
        page?: number
        totalPages?: number
        total?: number
    }
    error?: string
}

type ReleaseRow = {
    order_number: string | null
    status: string | null
    admin_status: string | null
    created_at: string
    updated_at: string | null
}

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, {
        status,
        headers: ADMIN_CORS_HEADERS,
    })
}

function normalizeText(value: string | null | undefined) {
    return String(value || "").trim().toLowerCase()
}

function titleCase(value: string | null | undefined) {
    return String(value || "")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase())
        .trim()
}

function isValidDateOnly(value: string) {
    return DATE_ONLY_PATTERN.test(value) && normalizeToBusinessDate(value) === value
}

function formatDateCell(value: string | null | undefined) {
    if (!value) return ""

    const parsedDate = new Date(value)

    if (Number.isNaN(parsedDate.getTime())) return value

    return parsedDate
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

function getOrderReference(order: ExportOrder) {
    return String(
        order.order_number || order.external_order_id || order.id || ""
    ).trim()
}

function getMatchingReleases(order: ExportOrder, releases: ReleaseRow[]) {
    const orderReference = normalizeText(getOrderReference(order))
    const storedOrderNumber = normalizeText(order.order_number)

    return releases.filter((release) => {
        const releaseOrderNumber = normalizeText(release.order_number)

        return (
            normalizeText(release.status) !== "draft" &&
            Boolean(releaseOrderNumber) &&
            (releaseOrderNumber === orderReference ||
                (storedOrderNumber && releaseOrderNumber === storedOrderNumber))
        )
    })
}

function getCompletedDate(order: ExportOrder, matchingReleases: ReleaseRow[]) {
    if (normalizeText(order.order_status) === "completed") {
        return order.updated_at || ""
    }

    const completedRelease = matchingReleases
        .filter(
            (release) =>
                normalizeText(release.status) === "completed" ||
                normalizeText(release.admin_status) === "completed"
        )
        .sort(
            (first, second) =>
                new Date(second.updated_at || second.created_at).getTime() -
                new Date(first.updated_at || first.created_at).getTime()
        )[0]

    return completedRelease?.updated_at || completedRelease?.created_at || ""
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

function createWorkbook(orders: ExportOrder[], releases: ReleaseRow[]) {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = "Rocket Press Wire"
    workbook.created = new Date()

    const worksheet = workbook.addWorksheet("Orders", {
        views: [{ state: "frozen", ySplit: 1 }],
    })

    worksheet.columns = [
        { header: "Order Number", key: "orderNumber", width: 30 },
        { header: "Customer Name", key: "customerName", width: 24 },
        { header: "Customer Email", key: "customerEmail", width: 32 },
        { header: "Order Date", key: "orderDate", width: 20 },
        { header: "Products / Outlets", key: "products", width: 42 },
        { header: "Package", key: "package", width: 22 },
        { header: "Amount", key: "amount", width: 15 },
        { header: "Payment Status", key: "paymentStatus", width: 18 },
        { header: "Order Status", key: "orderStatus", width: 18 },
        { header: "Release Status", key: "releaseStatus", width: 18 },
        { header: "Deadline", key: "deadline", width: 20 },
        { header: "Submitted Date", key: "submittedDate", width: 20 },
        { header: "Completed Date", key: "completedDate", width: 20 },
    ]

    for (const order of orders) {
        const items = order.items ?? []
        const packageItems = items.filter((item) =>
            PACKAGE_ID_SET.has(normalizeText(item.product_id))
        )
        const outletItems = items.filter(
            (item) => !PACKAGE_ID_SET.has(normalizeText(item.product_id))
        )
        const matchingReleases = getMatchingReleases(order, releases)
        const deadlineDates = items
            .map((item) => normalizeToBusinessDate(item.expected_completion_at))
            .filter((date): date is string => Boolean(date))
            .sort()
        const submittedDate = [...matchingReleases]
            .sort(
                (first, second) =>
                    new Date(first.created_at).getTime() -
                    new Date(second.created_at).getTime()
            )[0]?.created_at

        worksheet.addRow({
            orderNumber: getOrderReference(order),
            customerName: order.customer_name || "",
            customerEmail: order.customer_email || "",
            orderDate: formatDateCell(order.created_at),
            products: outletItems
                .map((item) => item.product_name || titleCase(item.product_id))
                .filter(Boolean)
                .join(", "),
            package: packageItems
                .map((item) => item.product_name || titleCase(item.product_id))
                .filter(Boolean)
                .join(", "),
            amount: Number(order.amount_total || 0) / 100,
            paymentStatus: titleCase(order.payment_status),
            orderStatus: titleCase(order.order_status),
            releaseStatus: matchingReleases.length > 0 ? "Received" : "Pending",
            deadline: deadlineDates[0] ? formatDateCell(deadlineDates[0]) : "",
            submittedDate: formatDateCell(submittedDate),
            completedDate: formatDateCell(
                getCompletedDate(order, matchingReleases)
            ),
        })
    }

    const headerRow = worksheet.getRow(1)
    headerRow.height = 24
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
    headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF5135F0" },
    }
    headerRow.alignment = { vertical: "middle" }
    headerRow.eachCell((cell) => {
        cell.border = {
            bottom: { style: "thin", color: { argb: "FF8069FF" } },
        }
    })

    worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, orders.length + 1), column: 13 },
    }

    for (const row of worksheet.getRows(2, orders.length) ?? []) {
        row.getCell("amount").numFmt = "$#,##0.00"
        for (const key of ["orderDate", "deadline", "submittedDate", "completedDate"]) {
            row.getCell(key).numFmt = "mmm d, yyyy h:mm AM/PM"
        }
        row.alignment = { vertical: "top", wrapText: true }
    }

    return workbook
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
                const hasRelease = getMatchingReleases(order, releaseRows).length > 0
                return releaseStatus === "received" ? hasRelease : !hasRelease
            })
        }

        const workbook = createWorkbook(orders, releaseRows)
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
