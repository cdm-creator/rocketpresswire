import ExcelJS from "exceljs"
import { normalizeToBusinessDate } from "@/lib/businessDate"
import { PACKAGE_IDS } from "@/lib/products"

const PACKAGE_ID_SET = new Set<string>(PACKAGE_IDS)

export type OrderExportItem = {
    product_id?: string | null
    product_name?: string | null
    item_status?: string | null
    expected_completion_at?: string | null
}

export type OrderExportOrder = {
    id: string
    order_number?: string | null
    external_order_id?: string | null
    customer_name?: string | null
    customer_email?: string | null
    writing_option?: string | null
    amount_total?: number | null
    currency?: string | null
    payment_status?: string | null
    order_status?: string | null
    created_at: string
    updated_at?: string | null
    items?: OrderExportItem[] | null
}

export type OrderExportRelease = {
    order_number: string | null
    company?: string | null
    status: string | null
    admin_status: string | null
    created_at: string
    updated_at: string | null
}

type WorkbookFormat = "manual" | "monthly"

function normalizeText(value: string | null | undefined) {
    return String(value || "").trim().toLowerCase()
}

function titleCase(value: string | null | undefined) {
    return String(value || "")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase())
        .trim()
}

function formatDateCell(value: string | null | undefined) {
    if (!value) return ""

    const parsedDate = new Date(value)
    return Number.isNaN(parsedDate.getTime()) ? value : parsedDate
}

export function getOrderExportReference(order: OrderExportOrder) {
    return String(
        order.order_number || order.external_order_id || order.id || ""
    ).trim()
}

export function getMatchingOrderReleases(
    order: OrderExportOrder,
    releases: OrderExportRelease[]
) {
    const orderReference = normalizeText(getOrderExportReference(order))
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

function getCompletedDate(
    order: OrderExportOrder,
    matchingReleases: OrderExportRelease[]
) {
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

function getSharedRow(order: OrderExportOrder, releases: OrderExportRelease[]) {
    const items = order.items ?? []
    const packageItems = items.filter((item) =>
        PACKAGE_ID_SET.has(normalizeText(item.product_id))
    )
    const outletItems = items.filter(
        (item) => !PACKAGE_ID_SET.has(normalizeText(item.product_id))
    )
    const matchingReleases = getMatchingOrderReleases(order, releases)
    const deadlineDates = items
        .map((item) => normalizeToBusinessDate(item.expected_completion_at))
        .filter((date): date is string => Boolean(date))
        .sort()
    const submittedDate = [...matchingReleases].sort(
        (first, second) =>
            new Date(first.created_at).getTime() -
            new Date(second.created_at).getTime()
    )[0]?.created_at
    const company = matchingReleases.find((release) =>
        Boolean(release.company?.trim())
    )?.company

    return {
        orderNumber: getOrderExportReference(order),
        customerName: order.customer_name || "",
        customerEmail: order.customer_email || "",
        companyName: company || "",
        orderDate: formatDateCell(order.created_at),
        products: outletItems
            .map((item) => item.product_name || titleCase(item.product_id))
            .filter(Boolean)
            .join(", "),
        package: packageItems
            .map((item) => item.product_name || titleCase(item.product_id))
            .filter(Boolean)
            .join(", "),
        writingOption: titleCase(order.writing_option),
        amount: Number(order.amount_total || 0) / 100,
        currency: String(order.currency || "").toUpperCase(),
        paymentStatus: titleCase(order.payment_status),
        orderStatus: titleCase(order.order_status),
        releaseStatus: matchingReleases.length > 0 ? "Received" : "Pending",
        deadline: deadlineDates[0] ? formatDateCell(deadlineDates[0]) : "",
        submittedDate: formatDateCell(submittedDate),
        completedDate: formatDateCell(
            getCompletedDate(order, matchingReleases)
        ),
    }
}

export function createOrderExportWorkbook(
    orders: OrderExportOrder[],
    releases: OrderExportRelease[],
    format: WorkbookFormat = "manual"
) {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = "Rocket PressWire"
    workbook.created = new Date()

    const worksheet = workbook.addWorksheet("Orders", {
        views: [{ state: "frozen", ySplit: 1 }],
    })

    worksheet.columns =
        format === "monthly"
            ? [
                  { header: "Order Number", key: "orderNumber", width: 30 },
                  { header: "Customer Name", key: "customerName", width: 24 },
                  { header: "Customer Email", key: "customerEmail", width: 32 },
                  { header: "Company Name", key: "companyName", width: 26 },
                  { header: "Order Date", key: "orderDate", width: 20 },
                  { header: "Products / Outlets", key: "products", width: 42 },
                  { header: "Package", key: "package", width: 22 },
                  { header: "Writing Option", key: "writingOption", width: 20 },
                  { header: "Amount Paid", key: "amount", width: 15 },
                  { header: "Currency", key: "currency", width: 12 },
                  { header: "Payment Status", key: "paymentStatus", width: 18 },
                  { header: "Order Status", key: "orderStatus", width: 18 },
                  { header: "Release Status", key: "releaseStatus", width: 18 },
                  { header: "Deadline", key: "deadline", width: 20 },
                  { header: "Release Submitted Date", key: "submittedDate", width: 24 },
                  { header: "Completed Date", key: "completedDate", width: 20 },
              ]
            : [
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
        worksheet.addRow(getSharedRow(order, releases))
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
        to: { row: Math.max(1, orders.length + 1), column: worksheet.columnCount },
    }

    for (const row of worksheet.getRows(2, orders.length) ?? []) {
        row.getCell("amount").numFmt =
            format === "manual" ? "$#,##0.00" : "#,##0.00"
        for (const key of [
            "orderDate",
            "deadline",
            "submittedDate",
            "completedDate",
        ]) {
            row.getCell(key).numFmt = "mmm d, yyyy h:mm AM/PM"
        }
        row.alignment = { vertical: "top", wrapText: true }
    }

    return workbook
}
