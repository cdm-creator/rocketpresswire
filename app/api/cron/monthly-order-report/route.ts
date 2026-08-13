import { createOrderExportWorkbook } from "@/lib/order-export"
import type {
    OrderExportItem,
    OrderExportOrder,
    OrderExportRelease,
} from "@/lib/order-export"
import { sendMonthlyOrderReportEmail } from "@/lib/monthly-report-email"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUSINESS_TIME_ZONE = "America/Chicago"
const QUERY_PAGE_SIZE = 1_000
const IN_FILTER_BATCH_SIZE = 200

type DatabaseOrder = Omit<OrderExportOrder, "items">
type DatabaseOrderItem = OrderExportItem & { order_id: string }

type MonthlyPeriod = {
    monthName: string
    year: number
    startDate: string
    endDate: string
    startUtc: string
    endUtcExclusive: string
    periodLabel: string
}

function isAuthorized(request: Request) {
    const cronSecret = process.env.CRON_SECRET?.trim()

    if (!cronSecret) {
        console.error("[monthly-order-report] Missing CRON_SECRET")
        return false
    }

    return request.headers.get("authorization") === `Bearer ${cronSecret}`
}

function pad(value: number) {
    return String(value).padStart(2, "0")
}

function formatDateOnly(year: number, month: number, day: number) {
    return `${year}-${pad(month)}-${pad(day)}`
}

function getTimeZoneOffsetMilliseconds(date: Date) {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: BUSINESS_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    })
    const parts = formatter.formatToParts(date)
    const getPart = (type: string) =>
        Number(parts.find((part) => part.type === type)?.value)
    const representedAsUtc = Date.UTC(
        getPart("year"),
        getPart("month") - 1,
        getPart("day"),
        getPart("hour"),
        getPart("minute"),
        getPart("second")
    )

    return representedAsUtc - Math.floor(date.getTime() / 1_000) * 1_000
}

function businessMidnightToUtc(
    year: number,
    month: number,
    day: number
) {
    const wallClockAsUtc = Date.UTC(year, month - 1, day)
    let utcTime = wallClockAsUtc

    // Re-evaluate the offset to safely account for CST/CDT at each boundary.
    for (let attempt = 0; attempt < 3; attempt += 1) {
        utcTime =
            wallClockAsUtc -
            getTimeZoneOffsetMilliseconds(new Date(utcTime))
    }

    return new Date(utcTime).toISOString()
}

function getPreviousCompleteMonth(now = new Date()): MonthlyPeriod {
    const currentParts = new Intl.DateTimeFormat("en-US", {
        timeZone: BUSINESS_TIME_ZONE,
        year: "numeric",
        month: "numeric",
    }).formatToParts(now)
    const currentYear = Number(
        currentParts.find((part) => part.type === "year")?.value
    )
    const currentMonth = Number(
        currentParts.find((part) => part.type === "month")?.value
    )
    const previousMonthDate = new Date(
        Date.UTC(currentYear, currentMonth - 2, 1)
    )
    const reportYear = previousMonthDate.getUTCFullYear()
    const reportMonth = previousMonthDate.getUTCMonth() + 1
    const lastDay = new Date(
        Date.UTC(currentYear, currentMonth - 1, 0)
    ).getUTCDate()
    const monthName = new Intl.DateTimeFormat("en-US", {
        month: "long",
        timeZone: "UTC",
    }).format(previousMonthDate)
    const startDate = formatDateOnly(reportYear, reportMonth, 1)
    const endDate = formatDateOnly(reportYear, reportMonth, lastDay)

    return {
        monthName,
        year: reportYear,
        startDate,
        endDate,
        startUtc: businessMidnightToUtc(reportYear, reportMonth, 1),
        endUtcExclusive: businessMidnightToUtc(
            currentYear,
            currentMonth,
            1
        ),
        periodLabel: `${monthName} 1, ${reportYear} - ${monthName} ${lastDay}, ${reportYear}`,
    }
}

function chunk<T>(values: T[], size: number) {
    const chunks: T[][] = []

    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size))
    }

    return chunks
}

async function loadOrders(period: MonthlyPeriod) {
    const orders: DatabaseOrder[] = []
    let from = 0

    while (true) {
        const { data, error } = await supabaseAdmin
            .from("orders")
            .select(
                "id,order_number,external_order_id,customer_name,customer_email,writing_option,amount_total,currency,payment_status,order_status,created_at,updated_at"
            )
            .gte("created_at", period.startUtc)
            .lt("created_at", period.endUtcExclusive)
            .order("created_at", { ascending: true })
            .range(from, from + QUERY_PAGE_SIZE - 1)
            .returns<DatabaseOrder[]>()

        if (error) throw error

        const page = data ?? []
        orders.push(...page)

        if (page.length < QUERY_PAGE_SIZE) break
        from += QUERY_PAGE_SIZE
    }

    return orders
}

async function loadOrderItems(orderIds: string[]) {
    const items: DatabaseOrderItem[] = []

    for (const orderIdBatch of chunk(orderIds, IN_FILTER_BATCH_SIZE)) {
        const { data, error } = await supabaseAdmin
            .from("order_items")
            .select(
                "order_id,product_id,product_name,item_status,expected_completion_at"
            )
            .in("order_id", orderIdBatch)
            .returns<DatabaseOrderItem[]>()

        if (error) throw error
        items.push(...(data ?? []))
    }

    return items
}

async function loadReleases(orderReferences: string[]) {
    const releases: OrderExportRelease[] = []

    for (const referenceBatch of chunk(
        orderReferences,
        IN_FILTER_BATCH_SIZE
    )) {
        const { data, error } = await supabaseAdmin
            .from("press_releases")
            .select(
                "order_number,company,status,admin_status,created_at,updated_at"
            )
            .in("order_number", referenceBatch)
            .returns<OrderExportRelease[]>()

        if (error) throw error
        releases.push(...(data ?? []))
    }

    return releases
}

async function loadReportData(period: MonthlyPeriod) {
    const databaseOrders = await loadOrders(period)

    if (databaseOrders.length === 0) {
        return { orders: [] as OrderExportOrder[], releases: [] }
    }

    const orderReferences = [
        ...new Set(
            databaseOrders
                .flatMap((order) => [
                    order.order_number,
                    order.external_order_id,
                    order.id,
                ])
                .map((value) => value?.trim())
                .filter((value): value is string => Boolean(value))
        ),
    ]
    const [items, releases] = await Promise.all([
        loadOrderItems(databaseOrders.map((order) => order.id)),
        loadReleases(orderReferences),
    ])
    const itemsByOrderId = new Map<string, OrderExportItem[]>()

    for (const { order_id: orderId, ...item } of items) {
        const orderItems = itemsByOrderId.get(orderId) ?? []
        orderItems.push(item)
        itemsByOrderId.set(orderId, orderItems)
    }

    return {
        orders: databaseOrders.map((order) => ({
            ...order,
            items: itemsByOrderId.get(order.id) ?? [],
        })),
        releases,
    }
}

export async function GET(request: Request) {
    if (!isAuthorized(request)) {
        return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const period = getPreviousCompleteMonth()

    try {
        const { orders, releases } = await loadReportData(period)
        const workbook = createOrderExportWorkbook(
            orders,
            releases,
            "monthly"
        )
        const workbookBuffer = await workbook.xlsx.writeBuffer()
        const filename = `Rocket-Press-Wire-${period.monthName}-${period.year}-Orders.xlsx`
        const delivery = await sendMonthlyOrderReportEmail({
            monthName: period.monthName,
            year: period.year,
            periodLabel: period.periodLabel,
            filename,
            attachment: Buffer.from(workbookBuffer),
        })

        console.log("[monthly-order-report] Report email sent", {
            reportStart: period.startDate,
            reportEnd: period.endDate,
            orderCount: orders.length,
            filename,
            messageId: delivery.messageId,
        })

        return Response.json(
            {
                success: true,
                reportPeriod: {
                    start: period.startDate,
                    end: period.endDate,
                    timeZone: BUSINESS_TIME_ZONE,
                },
                orderCount: orders.length,
                filename,
            },
            { status: 200 }
        )
    } catch (error) {
        console.error("[monthly-order-report] Failed to generate or send report", {
            reportStart: period.startDate,
            reportEnd: period.endDate,
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return Response.json(
            { error: "Failed to generate or send monthly order report" },
            { status: 500 }
        )
    }
}
