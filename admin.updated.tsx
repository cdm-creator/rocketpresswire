import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { RenderTarget } from "framer"

/* =========================================================
   CONFIG
========================================================= */

const ADMIN_API = "https://rocketpresswire.vercel.app/api/admin/orders"

const UPDATE_ITEM_API =
    "https://rocketpresswire.vercel.app/api/admin/order-items"

const LIVE_SITE = "https://rocketpresswire.com/"

const LOGIN_URL = `${LIVE_SITE}/login`

const AUTH_REFRESH_API = "https://rocketpresswire.vercel.app/api/auth/refresh"

const AUTH_ROLE_API = "https://rocketpresswire.vercel.app/api/auth/role"

const ADMIN_AUTH_REDIRECT_EVENT = "rpw-admin-auth-redirect"

const ADMIN_RELEASES_API =
    "https://rocketpresswire.vercel.app/api/admin/releases"

const ADMIN_RELEASE_REPORT_API =
    "https://rocketpresswire.vercel.app/api/admin/release-report"

// Rocket Press Wire business timezone. The IANA zone automatically handles CST/CDT.
const BUSINESS_TIME_ZONE = "America/Chicago"

/* =========================================================
   TYPES
========================================================= */

type OrderItem = {
    id: string
    order_id?: string
    product_id: string
    product_name: string
    quantity: number
    unit_amount: number
    item_status: string
    delivery_text?: string | null
    published_url?: string | null
    expected_completion_at?: string | null
    created_at?: string
}

type Order = {
    id: string
    order_number?: string | null
    customer_email: string
    customer_name?: string | null
    company?: string | null
    source: string
    external_order_id?: string | null
    amount_total: number
    currency: string
    payment_status: string
    order_status: string
    created_at: string
    updated_at?: string
    items: OrderItem[]
}

type AdminPagination = {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
}

type LatestOrder = {
    id: string
    order_number?: string | null
    customer_name?: string | null
    customer_email?: string | null
    source: string
    amount_total: number
    currency: string
    created_at: string
}

type OrdersQueryOverrides = {
    status?: string
    deadline?: string
}

type AdminResponse = {
    admin: {
        email: string
        name?: string | null
    }

    summary: {
        totalOrders: number
        processing: number
        published: number
        completed: number
        overdueItems: number
        overdueOrders: number
        totalRevenue: number
        stripeOrders: number
        thrivecartOrders: number
    }

    orders: Order[]
    pagination?: AdminPagination
    latestOrder?: LatestOrder | null
}

type CachedOrdersResponse = {
    data: AdminResponse
    cachedAt: number
}

type NewOrderToast = {
    orderId: string
    orderNumber: string
    customerName: string
    source: string
    total: string
    count: number
}

type SyncMode = "connecting" | "realtime" | "auto"

type AdminTab = "dashboard" | "total-releases"

type AdminAuthState = "checking" | "authenticated" | "redirecting" | "error"

const ORDERS_CACHE_STALE_MS = 60_000

type PendingUnsavedAction =
    | {
          type: "collapse-order"
          orderId: string
      }
    | {
          type: "tab-change"
          tab: AdminTab
      }
    | {
          type: "logout"
      }

type AdminRelease = {
    id: string
    user_email?: string | null
    order_number?: string | null
    writing_option?: "own" | "journalist" | null
    website_url?: string | null
    title?: string | null
    summary?: string | null
    featured_image_url?: string | null
    content?: string | null
    categories?: string[] | null
    contact_name?: string | null
    contact_email?: string | null
    company?: string | null
    phone?: string | null
    full_address?: string | null
    seo_title?: string | null
    keywords?: string | null
    meta_description?: string | null
    status?: string | null
    admin_status?: string | null
    published_url?: string | null
    report_pdf_url?: string | null
    report_excel_url?: string | null
    report_title?: string | null
    live_article_links?: string[] | null
    admin_notes?: string | null
    same_content_for_all_outlets?: boolean | null
    outlet_ids?: string[] | null
    outlet_names?: string[] | null
    source_document_path?: string | null
    source_document_name?: string | null
    source_document_mime_type?: string | null
    source_document_size_bytes?: number | null
    created_at?: string | null
    updated_at?: string | null
}

type AdminReleasesResponse = {
    releases: AdminRelease[]
}

/* =========================================================
   MOCK DATA FOR FRAMER CANVAS
========================================================= */

const MOCK_DATA: AdminResponse = {
    admin: {
        email: "admin@example.com",
        name: "Client Admin",
    },

    summary: {
        totalOrders: 4,
        processing: 2,
        published: 1,
        completed: 1,
        overdueItems: 0,
        overdueOrders: 0,
        totalRevenue: 364900,
        stripeOrders: 2,
        thrivecartOrders: 2,
    },

    orders: [
        {
            id: "mock-order-1",
            order_number: "RPW-20260706015755-OK8F2A",
            customer_email: "customer@example.com",
            customer_name: "Teena",
            source: "thrivecart",
            external_order_id: "42331194",
            amount_total: 19400,
            currency: "usd",
            payment_status: "paid",
            order_status: "processing",
            created_at: new Date().toISOString(),

            items: [
                {
                    id: "mock-item-1",
                    product_id: "product_3",
                    product_name: "Core",
                    quantity: 1,
                    unit_amount: 19400,
                    item_status: "processing",
                    delivery_text: "5 Days",
                    expected_completion_at: new Date(
                        Date.now() + 5 * 86400000
                    ).toISOString(),
                },
            ],
        },

        {
            id: "mock-order-2",
            order_number: "RPW-20260706014409-CUUW7T",
            customer_email: "customer@example.com",
            customer_name: "Teena",
            source: "thrivecart",
            external_order_id: "42331049",
            amount_total: 9500,
            currency: "usd",
            payment_status: "paid",
            order_status: "completed",
            created_at: new Date(Date.now() - 86400000).toISOString(),

            items: [
                {
                    id: "mock-item-2",
                    product_id: "product_3",
                    product_name: "Core",
                    quantity: 1,
                    unit_amount: 9500,
                    item_status: "completed",
                    delivery_text: "5 Days",
                    expected_completion_at: new Date().toISOString(),
                },
            ],
        },

        {
            id: "mock-order-3",
            order_number: "RPW-20260706014153-GF1QT8",
            customer_email: "customer@example.com",
            customer_name: "Test User",
            source: "stripe",
            external_order_id: "cs_test_example",
            amount_total: 168000,
            currency: "usd",
            payment_status: "paid",
            order_status: "processing",
            created_at: new Date(Date.now() - 2 * 86400000).toISOString(),

            items: [
                {
                    id: "mock-item-3",
                    product_id: "msn",
                    product_name: "MSN",
                    quantity: 1,
                    unit_amount: 14000,
                    item_status: "processing",
                    delivery_text: "5 Days",
                    expected_completion_at: new Date(
                        Date.now() + 5 * 86400000
                    ).toISOString(),
                },

                {
                    id: "mock-item-4",
                    product_id: "reuters",
                    product_name: "Reuters",
                    quantity: 1,
                    unit_amount: 140000,
                    item_status: "processing",
                    delivery_text: "7 Days",
                    expected_completion_at: new Date(
                        Date.now() + 7 * 86400000
                    ).toISOString(),
                },

                {
                    id: "mock-item-5",
                    product_id: "openPR",
                    product_name: "OpenPR",
                    quantity: 1,
                    unit_amount: 14000,
                    item_status: "processing",
                    delivery_text: "2 Days",
                    expected_completion_at: new Date(
                        Date.now() + 2 * 86400000
                    ).toISOString(),
                },
            ],
        },

        {
            id: "mock-order-4",
            order_number: "RPW-20260706015233-3ONGE4",
            customer_email: "customer@example.com",
            customer_name: "Testing",
            source: "stripe",
            external_order_id: "cs_test_example_2",
            amount_total: 168000,
            currency: "usd",
            payment_status: "paid",
            order_status: "published",
            created_at: new Date(Date.now() - 3 * 86400000).toISOString(),

            items: [
                {
                    id: "mock-item-6",
                    product_id: "msn",
                    product_name: "MSN",
                    quantity: 1,
                    unit_amount: 14000,
                    item_status: "published",
                    delivery_text: "5 Days",
                    published_url: "https://example.com/article",
                    expected_completion_at: new Date().toISOString(),
                },
            ],
        },
    ],
}

const MOCK_RELEASES: AdminRelease[] = [
    {
        id: "mock-release-1",
        user_email: "customer@example.com",
        order_number: "RPW-20260710035328-JYVIFZ",
        website_url: "https://rocketpresswire.com/",
        title: "Coozmoo Launches AEO and GEO Services",
        status: "submitted",
        admin_status: "pending_review",
        contact_name: "Teena",
        contact_email: "customer@example.com",
        created_at: new Date().toISOString(),
    },
    {
        id: "mock-release-2",
        user_email: "client@example.com",
        order_number: "RPW-20260706015755-OK8F2A",
        website_url: "https://example.com",
        title: "Client Announces New Digital Growth Campaign",
        status: "processing",
        admin_status: "current",
        contact_name: "Client Admin",
        contact_email: "client@example.com",
        created_at: new Date(Date.now() - 86400000).toISOString(),
    },
]

/* =========================================================
   HELPERS
========================================================= */

function formatMoney(amount: number, currency = "usd") {
    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currency.toUpperCase(),
        }).format((amount || 0) / 100)
    } catch {
        return `$${((amount || 0) / 100).toFixed(2)}`
    }
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 24 * 60 * 60 * 1000

const BUSINESS_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
})

const DATE_ONLY_DISPLAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
})

function isValidDateOnly(value: string) {
    const match = DATE_ONLY_PATTERN.exec(value)

    if (!match) return false

    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const parsed = new Date(Date.UTC(year, month - 1, day))

    return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
    )
}

/**
 * Normalizes a stored deadline/timestamp to the Rocket Press Wire business
 * calendar date in America/Chicago. Plain YYYY-MM-DD values stay unchanged,
 * preventing UTC conversion from shifting a selected date.
 */
function normalizeBusinessDate(date?: string | null) {
    if (!date) return ""

    const value = date.trim()

    if (!value) return ""

    if (DATE_ONLY_PATTERN.test(value)) {
        return isValidDateOnly(value) ? value : ""
    }

    const parsed = new Date(value)

    if (Number.isNaN(parsed.getTime())) return ""

    const parts = BUSINESS_DATE_PARTS_FORMATTER.formatToParts(parsed)
    const year = parts.find((part) => part.type === "year")?.value
    const month = parts.find((part) => part.type === "month")?.value
    const day = parts.find((part) => part.type === "day")?.value

    if (!year || !month || !day) return ""

    const normalized = `${year}-${month}-${day}`

    return isValidDateOnly(normalized) ? normalized : ""
}

function getCurrentBusinessDate() {
    return normalizeBusinessDate(new Date().toISOString())
}

function dateOnlyToUtcDayValue(value: string) {
    const match = DATE_ONLY_PATTERN.exec(value)

    if (!match || !isValidDateOnly(value)) return null

    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function formatDate(date?: string | null) {
    if (!date) return "—"

    const normalized = normalizeBusinessDate(date)
    const dayValue = normalized ? dateOnlyToUtcDayValue(normalized) : null

    if (dayValue === null) return date

    return DATE_ONLY_DISPLAY_FORMATTER.format(new Date(dayValue))
}

function toDateInputValue(date?: string | null) {
    return normalizeBusinessDate(date)
}

function titleCase(value?: string) {
    if (!value) return "—"

    return value
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatFileSize(bytes?: number | null) {
    const value = Number(bytes || 0)

    if (!Number.isFinite(value) || value <= 0) return "Size unavailable"

    if (value < 1024) return `${Math.round(value)} B`

    const kilobytes = value / 1024

    if (kilobytes < 1024) {
        return `${kilobytes >= 10 ? kilobytes.toFixed(0) : kilobytes.toFixed(1)} KB`
    }

    const megabytes = kilobytes / 1024

    return `${megabytes >= 10 ? megabytes.toFixed(1) : megabytes.toFixed(2)} MB`
}

function getSourceDocumentTypeLabel(release: AdminRelease) {
    const fileName = (release.source_document_name || "").trim()
    const extension = fileName.includes(".")
        ? fileName.split(".").pop()?.trim().toUpperCase() || ""
        : ""

    if (extension) return extension

    const mimeType = (release.source_document_mime_type || "").toLowerCase()

    if (mimeType.includes("pdf")) return "PDF"
    if (mimeType.includes("word")) return "DOC"
    if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
        return "SPREADSHEET"
    }
    if (mimeType.includes("csv")) return "CSV"

    return "FILE"
}

type UserReleaseStatus = "submitted" | "processing" | "published" | "completed"

type AdminReleaseStatus = "pending_review" | "processing" | "completed"

function normalizeUserReleaseStatus(value?: string | null): UserReleaseStatus {
    const normalized = (value || "").trim().toLowerCase()

    if (
        normalized === "processing" ||
        normalized === "in_review" ||
        normalized === "current"
    ) {
        return "processing"
    }

    if (normalized === "published") {
        return "published"
    }

    if (normalized === "completed") {
        return "completed"
    }

    // Legacy/missing values such as draft or pending are treated as submitted.
    return "submitted"
}

function normalizeAdminReleaseStatus(
    value?: string | null
): AdminReleaseStatus {
    const normalized = (value || "").trim().toLowerCase()

    if (
        normalized === "processing" ||
        normalized === "current" ||
        normalized === "in_review" ||
        normalized === "published"
    ) {
        return "processing"
    }

    if (normalized === "completed") {
        return "completed"
    }

    // Legacy/missing values such as draft, pending or submitted stay pending review.
    return "pending_review"
}

function getReleaseDisplayStatus(release: AdminRelease): UserReleaseStatus {
    const userStatus = normalizeUserReleaseStatus(release.status)
    const adminStatus = normalizeAdminReleaseStatus(release.admin_status)

    if (userStatus === "completed" || adminStatus === "completed") {
        return "completed"
    }

    if (userStatus === "published") {
        return "published"
    }

    if (userStatus === "processing" || adminStatus === "processing") {
        return "processing"
    }

    return "submitted"
}

function getAdminReleaseOutletDisplay(release: AdminRelease) {
    const outletNames = (release.outlet_names || [])
        .map((name) => String(name || "").trim())
        .filter(Boolean)

    if (release.same_content_for_all_outlets || outletNames.length === 0) {
        return {
            label: "All Outlets",
            title:
                outletNames.length > 0
                    ? outletNames.join(", ")
                    : "Same release content applies to the full order",
        }
    }

    if (outletNames.length === 1) {
        return {
            label: outletNames[0],
            title: outletNames[0],
        }
    }

    return {
        label: `${outletNames[0]} +${outletNames.length - 1}`,
        title: outletNames.join(", "),
    }
}

function normalizeOrderReference(value?: string | null) {
    return String(value || "")
        .trim()
        .toLowerCase()
}

function orderHasReceivedRelease(order: Order, releases: AdminRelease[]) {
    const storedOrderNumber = normalizeOrderReference(order.order_number)
    const displayOrderNumber = normalizeOrderReference(
        orderDisplayNumber(order)
    )

    return releases.some((release) => {
        const releaseOrderNumber = normalizeOrderReference(release.order_number)
        const releaseStatus = String(release.status || "")
            .trim()
            .toLowerCase()

        if (!releaseOrderNumber || releaseStatus === "draft") {
            return false
        }

        return (
            (storedOrderNumber && releaseOrderNumber === storedOrderNumber) ||
            releaseOrderNumber === displayOrderNumber
        )
    })
}

function getOrderReleaseOutletDisplay(order: Order, releases: AdminRelease[]) {
    const storedOrderNumber = normalizeOrderReference(order.order_number)
    const displayOrderNumber = normalizeOrderReference(
        orderDisplayNumber(order)
    )

    const matchingReleases = releases.filter((release) => {
        const releaseOrderNumber = normalizeOrderReference(release.order_number)
        const releaseStatus = String(release.status || "")
            .trim()
            .toLowerCase()

        if (!releaseOrderNumber || releaseStatus === "draft") {
            return false
        }

        return (
            (storedOrderNumber && releaseOrderNumber === storedOrderNumber) ||
            releaseOrderNumber === displayOrderNumber
        )
    })

    if (matchingReleases.length === 0) {
        return {
            label: "Release Pending",
            title: "No release has been submitted for this order yet",
        }
    }

    const orderItemNamesById = new Map(
        (order.items || []).map((item) => [
            String(item.product_id || "")
                .trim()
                .toLowerCase(),
            String(item.product_name || "").trim(),
        ])
    )

    const outletNames: string[] = []
    let coversAllOutlets = false

    for (const release of matchingReleases) {
        const releaseOutletNames = Array.isArray(release.outlet_names)
            ? release.outlet_names
                  .map((name) => String(name || "").trim())
                  .filter(Boolean)
            : []

        const releaseOutletIds = Array.isArray(release.outlet_ids)
            ? release.outlet_ids
                  .map((id) => String(id || "").trim())
                  .filter(Boolean)
            : []

        if (
            release.same_content_for_all_outlets ||
            (releaseOutletNames.length === 0 && releaseOutletIds.length === 0)
        ) {
            coversAllOutlets = true
            break
        }

        if (releaseOutletNames.length > 0) {
            outletNames.push(...releaseOutletNames)
            continue
        }

        for (const outletId of releaseOutletIds) {
            const matchingName = orderItemNamesById.get(outletId.toLowerCase())

            if (matchingName) {
                outletNames.push(matchingName)
            }
        }
    }

    if (coversAllOutlets) {
        return {
            label: "All Outlets",
            title: "Same release content applies to all outlets in this order",
        }
    }

    const uniqueOutletNames = Array.from(new Set(outletNames.filter(Boolean)))

    if (uniqueOutletNames.length === 0) {
        return {
            label: "Release Received",
            title: "Release submitted, but outlet details are not available",
        }
    }

    if (uniqueOutletNames.length === 1) {
        return {
            label: uniqueOutletNames[0],
            title: uniqueOutletNames[0],
        }
    }

    return {
        label: `${uniqueOutletNames[0]} +${uniqueOutletNames.length - 1}`,
        title: uniqueOutletNames.join(", "),
    }
}

function getShortExternalId(value?: string | null) {
    const externalId = String(value || "").trim()

    if (!externalId) return "—"
    if (externalId.length <= 22) return externalId

    return `${externalId.slice(0, 10)}…${externalId.slice(-8)}`
}

function orderDisplayNumber(order: {
    id: string
    order_number?: string | null
    external_order_id?: string | null
}) {
    if (order.order_number) {
        return order.order_number
    }

    if (order.external_order_id) {
        return `#${order.external_order_id.slice(-10).toUpperCase()}`
    }

    return `#${order.id.slice(-8).toUpperCase()}`
}

type DeadlineType =
    | "overdue"
    | "due-today"
    | "due-tomorrow"
    | "due-soon"
    | "on-track"
    | "completed"
    | "none"

type DeadlineState = {
    type: DeadlineType
    label: string
    daysDifference: number | null
}

function getDeadlineState(
    expectedDate?: string | null,
    itemStatus?: string
): DeadlineState {
    if ((itemStatus || "").trim().toLowerCase() === "completed") {
        return {
            type: "completed",
            label: "Completed",
            daysDifference: null,
        }
    }

    const expectedBusinessDate = normalizeBusinessDate(expectedDate)
    const todayBusinessDate = getCurrentBusinessDate()

    if (!expectedBusinessDate || !todayBusinessDate) {
        return {
            type: "none",
            label: "No Expected Date",
            daysDifference: null,
        }
    }

    const expectedDayValue = dateOnlyToUtcDayValue(expectedBusinessDate)
    const todayDayValue = dateOnlyToUtcDayValue(todayBusinessDate)

    if (expectedDayValue === null || todayDayValue === null) {
        return {
            type: "none",
            label: "No Expected Date",
            daysDifference: null,
        }
    }

    // Date-only UTC day values avoid DST-length days while the actual calendar
    // dates themselves come from America/Chicago.
    const daysDifference = Math.round(
        (expectedDayValue - todayDayValue) / DAY_MS
    )

    if (daysDifference < 0) {
        const lateDays = Math.abs(daysDifference)

        return {
            type: "overdue",
            label: `Overdue · ${lateDays} ${lateDays === 1 ? "day" : "days"}`,
            daysDifference,
        }
    }

    if (daysDifference === 0) {
        return {
            type: "due-today",
            label: "Due Today",
            daysDifference,
        }
    }

    if (daysDifference === 1) {
        return {
            type: "due-tomorrow",
            label: "Due Tomorrow",
            daysDifference,
        }
    }

    if (daysDifference <= 3) {
        return {
            type: "due-soon",
            label: `Due Soon · ${daysDifference} days left`,
            daysDifference,
        }
    }

    return {
        type: "on-track",
        label: `On Track · ${daysDifference} days left`,
        daysDifference,
    }
}

function getOrderOverdueItemCount(order: Order) {
    return (order.items || []).filter(
        (item) =>
            getDeadlineState(item.expected_completion_at, item.item_status)
                .type === "overdue"
    ).length
}

function readSessionTokenFromStorage(
    storage: Storage | null,
    tokenType: "access_token" | "refresh_token"
) {
    if (!storage) return ""

    const directKeys =
        tokenType === "access_token"
            ? [
                  "rpw_access_token",
                  "access_token",
                  "auth_token",
                  "token",
                  "admin_token",
              ]
            : ["rpw_refresh_token"]

    for (const key of directKeys) {
        const value = storage.getItem(key)?.trim()

        if (value) return value
    }

    for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)

        if (
            !key ||
            (!key.includes("auth-token") && !key.includes("supabase"))
        ) {
            continue
        }

        const storedValue = storage.getItem(key)

        if (!storedValue) continue

        try {
            const parsed = JSON.parse(storedValue)

            const token =
                parsed?.[tokenType] ||
                parsed?.currentSession?.[tokenType] ||
                parsed?.session?.[tokenType] ||
                ""

            if (typeof token === "string" && token.trim()) {
                return token.trim()
            }
        } catch {
            /*
             * Supabase stores its session as JSON. Ignore unparseable
             * values instead of accidentally sending the whole JSON value
             * as a Bearer token.
             */
        }
    }

    return ""
}

function saveSessionTokens(accessToken: string, refreshToken?: string | null) {
    if (typeof window === "undefined") return

    window.localStorage.setItem("rpw_access_token", accessToken)

    if (refreshToken) {
        window.localStorage.setItem("rpw_refresh_token", refreshToken)
    }

    window.sessionStorage.removeItem("rpw_access_token")
    window.sessionStorage.removeItem("rpw_refresh_token")
}

function getStoredAccessToken() {
    if (typeof window === "undefined") return ""

    return (
        readSessionTokenFromStorage(window.localStorage, "access_token") ||
        readSessionTokenFromStorage(window.sessionStorage, "access_token")
    )
}

function getStoredRefreshToken() {
    if (typeof window === "undefined") return ""

    return (
        readSessionTokenFromStorage(window.localStorage, "refresh_token") ||
        readSessionTokenFromStorage(window.sessionStorage, "refresh_token")
    )
}

type AuthRefreshResult =
    | {
          status: "success"
          accessToken: string
      }
    | {
          status: "missing"
      }
    | {
          status: "invalid"
      }
    | {
          status: "temporary-error"
          message: string
      }

class AuthRedirectError extends Error {
    constructor(message = "Your session has expired. Please sign in again.") {
        super(message)
        this.name = "AuthRedirectError"
    }
}

class AuthTemporaryError extends Error {
    constructor(
        message = "Unable to verify your admin session right now. Please retry."
    ) {
        super(message)
        this.name = "AuthTemporaryError"
    }
}

type AdminAccessCheck =
    | {
          status: "active"
      }
    | {
          status: "inactive"
      }
    | {
          status: "unauthorized"
      }
    | {
          status: "temporary-error"
          message: string
      }

let refreshSessionPromise: Promise<AuthRefreshResult> | null = null
let loginRedirectStarted = false

async function performAuthRefresh(): Promise<AuthRefreshResult> {
    if (typeof window === "undefined") {
        return { status: "missing" }
    }

    const refreshToken = getStoredRefreshToken()

    if (!refreshToken) {
        return { status: "missing" }
    }

    try {
        const response = await fetch(AUTH_REFRESH_API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                refresh_token: refreshToken,
            }),
        })

        const json = await response.json().catch(() => null)

        if (!response.ok) {
            /*
             * Only definitive auth failures invalidate the stored session.
             * A Vercel/server/network problem must not randomly log the admin out.
             */
            if (
                response.status === 400 ||
                response.status === 401 ||
                response.status === 403
            ) {
                return { status: "invalid" }
            }

            return {
                status: "temporary-error",
                message:
                    json?.error ||
                    `Session refresh temporarily failed (${response.status}).`,
            }
        }

        const accessToken =
            json?.access_token || json?.session?.access_token || ""

        const nextRefreshToken =
            json?.refresh_token || json?.session?.refresh_token || refreshToken

        if (!accessToken) {
            return {
                status: "temporary-error",
                message:
                    "Session refresh succeeded but no access token was returned.",
            }
        }

        saveSessionTokens(accessToken, nextRefreshToken)

        return {
            status: "success",
            accessToken,
        }
    } catch (error) {
        console.error("Unable to refresh admin session:", error)

        return {
            status: "temporary-error",
            message:
                "Unable to reach the session refresh service. Please retry.",
        }
    }
}

async function refreshAuthSession(): Promise<AuthRefreshResult> {
    if (typeof window === "undefined") {
        return { status: "missing" }
    }

    if (refreshSessionPromise) {
        return await refreshSessionPromise
    }

    const currentRefreshPromise = performAuthRefresh()
    refreshSessionPromise = currentRefreshPromise

    try {
        return await currentRefreshPromise
    } finally {
        if (refreshSessionPromise === currentRefreshPromise) {
            refreshSessionPromise = null
        }
    }
}

async function verifyActiveAdmin(
    accessToken: string
): Promise<AdminAccessCheck> {
    try {
        const response = await fetch(AUTH_ROLE_API, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            cache: "no-store",
        })

        const json = await response.json().catch(() => null)

        if (response.status === 401) {
            return { status: "unauthorized" }
        }

        if (!response.ok) {
            return {
                status: "temporary-error",
                message:
                    json?.error ||
                    `Admin verification temporarily failed (${response.status}).`,
            }
        }

        return json?.role === "admin" || json?.isAdmin === true
            ? { status: "active" }
            : { status: "inactive" }
    } catch (error) {
        console.error("Unable to verify active admin access:", error)

        return {
            status: "temporary-error",
            message: "Unable to verify admin access right now. Please retry.",
        }
    }
}

function startLoginRedirect(message?: string): never {
    clearAuthStorage()
    redirectToLogin()
    throw new AuthRedirectError(message)
}

async function authenticatedFetch(url: string, options: RequestInit = {}) {
    let token = getStoredAccessToken()

    if (!token) {
        const initialRefresh = await refreshAuthSession()

        if (initialRefresh.status === "success") {
            token = initialRefresh.accessToken
        } else if (
            initialRefresh.status === "missing" ||
            initialRefresh.status === "invalid"
        ) {
            startLoginRedirect()
        } else {
            throw new AuthTemporaryError(initialRefresh.message)
        }
    }

    const makeRequest = (accessToken: string) =>
        fetch(url, {
            ...options,
            headers: {
                ...(options.headers || {}),
                Authorization: `Bearer ${accessToken}`,
            },
        })

    let response = await makeRequest(token)

    if (response.status !== 401 && response.status !== 403) {
        return response
    }

    /*
     * First recover the session once. A refreshed Supabase session can
     * rotate the refresh token, so saveSessionTokens() keeps both copies
     * synchronized before retrying the admin request.
     */
    const refreshResult = await refreshAuthSession()

    if (refreshResult.status === "temporary-error") {
        throw new AuthTemporaryError(refreshResult.message)
    }

    if (
        refreshResult.status === "missing" ||
        refreshResult.status === "invalid"
    ) {
        startLoginRedirect()
    }

    token = refreshResult.accessToken
    response = await makeRequest(token)

    if (response.status !== 401 && response.status !== 403) {
        return response
    }

    /*
     * Do not destroy the session because one protected admin endpoint
     * returned 403. Confirm the account's live role first.
     */
    const accessCheck = await verifyActiveAdmin(token)

    if (accessCheck.status === "active") {
        throw new AuthTemporaryError(
            response.status === 403
                ? "Admin access is active, but this request was temporarily denied. Showing the last successfully loaded data."
                : "Your admin session is active, but this request could not be completed. Please retry."
        )
    }

    if (accessCheck.status === "temporary-error") {
        throw new AuthTemporaryError(accessCheck.message)
    }

    /*
     * Logout only after the refreshed token is unauthorized or the role
     * endpoint confirms this user is no longer an active administrator.
     */
    startLoginRedirect(
        accessCheck.status === "inactive"
            ? "This account does not have active admin access."
            : undefined
    )
}

function clearAuthStorage() {
    if (typeof window === "undefined") return

    const keysToRemove = [
        "rpw_access_token",
        "rpw_refresh_token",
        "access_token",
        "auth_token",
        "token",
        "admin_token",
        "supabase.auth.token",
    ]

    for (const storage of [window.localStorage, window.sessionStorage]) {
        keysToRemove.forEach((key) => storage.removeItem(key))

        const dynamicKeys: string[] = []

        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index)

            if (
                key &&
                (key.includes("auth-token") || key.includes("supabase"))
            ) {
                dynamicKeys.push(key)
            }
        }

        dynamicKeys.forEach((key) => storage.removeItem(key))
    }
}

function redirectToLogin() {
    if (typeof window === "undefined" || loginRedirectStarted) return

    loginRedirectStarted = true

    window.dispatchEvent(new Event(ADMIN_AUTH_REDIRECT_EVENT))
    window.location.replace(LOGIN_URL)
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function AdminDashboard() {
    const isCanvas = RenderTarget.current() === RenderTarget.canvas

    const [data, setData] = useState<AdminResponse | null>(
        isCanvas ? MOCK_DATA : null
    )

    const [loading, setLoading] = useState(!isCanvas)

    const [authState, setAuthState] = useState<AdminAuthState>(
        isCanvas ? "authenticated" : "checking"
    )

    const [refreshing, setRefreshing] = useState(false)

    const [ordersPageLoading, setOrdersPageLoading] = useState(false)

    const [ordersReady, setOrdersReady] = useState(isCanvas)

    const [error, setError] = useState("")

    const [syncWarning, setSyncWarning] = useState("")

    const [search, setSearch] = useState("")

    const [debouncedSearch, setDebouncedSearch] = useState("")

    const [statusFilter, setStatusFilter] = useState("all")
    const ORDERS_PER_PAGE = 12

    const [currentPage, setCurrentPage] = useState(1)

    const [deadlineFilter, setDeadlineFilter] = useState("all")

    const [orderReleaseStatusFilter, setOrderReleaseStatusFilter] =
        useState("all")

    const [expandedOrders, setExpandedOrders] = useState<
        Record<string, boolean>
    >({})

    const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({})

    const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({})

    const [dateDrafts, setDateDrafts] = useState<Record<string, string>>({})

    const [savingItemId, setSavingItemId] = useState<string | null>(null)

    const [itemMessages, setItemMessages] = useState<Record<string, string>>({})

    const [newOrderToast, setNewOrderToast] = useState<NewOrderToast | null>(
        null
    )

    const [copiedExternalOrderId, setCopiedExternalOrderId] = useState<
        string | null
    >(null)

    const [syncMode, setSyncMode] = useState<SyncMode>("connecting")

    const [activeTab, setActiveTab] = useState<AdminTab>("dashboard")

    const [releases, setReleases] = useState<AdminRelease[]>(
        isCanvas ? MOCK_RELEASES : []
    )

    const [releaseLoading, setReleaseLoading] = useState(false)

    const [releaseError, setReleaseError] = useState("")

    const [releaseStatusFilter, setReleaseStatusFilter] = useState("all")

    const [hasUnsavedReleaseChanges, setHasUnsavedReleaseChanges] =
        useState(false)

    const [pendingUnsavedAction, setPendingUnsavedAction] =
        useState<PendingUnsavedAction | null>(null)

    const latestOrderIdRef = useRef<string | null>(null)
    const externalIdCopyTimerRef = useRef<number | null>(null)
    const knownTotalOrdersRef = useRef<number | null>(null)
    const initialOrdersLoadedRef = useRef(false)
    const toastTimerRef = useRef<number | null>(null)
    const refreshTimerRef = useRef<number | null>(null)
    const pendingNewOrderNotificationRef = useRef(false)
    const pendingOrderFocusRef = useRef<string | null>(null)
    const hasLoadedOrdersRef = useRef(isCanvas)
    const hasLoadedReleasesRef = useRef(isCanvas)
    const releasesLoadPromiseRef = useRef<Promise<void> | null>(null)
    const ordersLoadPromiseRef = useRef<Promise<
        AdminResponse | undefined
    > | null>(null)
    const ordersLoadKeyRef = useRef<string | null>(null)
    const latestOrdersQueryKeyRef = useRef("")
    const ordersCacheRef = useRef<Map<string, CachedOrdersResponse>>(new Map())
    const ordersAbortControllerRef = useRef<AbortController | null>(null)
    const skipNextOrdersQueryEffectRef = useRef(false)
    const hasInitializedOrdersQueryEffectRef = useRef(false)
    const allowNavigationRef = useRef(false)

    const applyDashboardSearch = useCallback(
        (inputValue: string, normalizedValue: string) => {
            setSearch(inputValue)
            setDebouncedSearch(normalizedValue)
        },
        []
    )

    /* =====================================================
       LOAD ORDERS
    ===================================================== */

    function buildOrdersApiUrl(
        pageOverride?: number,
        overrides: OrdersQueryOverrides = {}
    ) {
        const page = Math.max(1, pageOverride ?? currentPage)
        const params = new URLSearchParams()

        params.set("page", String(page))
        params.set("limit", String(ORDERS_PER_PAGE))

        const nextStatus = overrides.status ?? statusFilter
        const nextDeadline = overrides.deadline ?? deadlineFilter

        if (nextStatus !== "all") params.set("status", nextStatus)
        if (nextDeadline !== "all") params.set("deadline", nextDeadline)

        return `${ADMIN_API}?${params.toString()}`
    }

    async function loadOrders(
        manualRefresh = false,
        silent = false,
        notifyOnNew = false,
        pageOverride?: number,
        queryOverrides: OrdersQueryOverrides = {},
        preferCache = false
    ): Promise<AdminResponse | undefined> {
        if (isCanvas) {
            setData(MOCK_DATA)
            setLoading(false)
            setOrdersReady(true)
            return MOCK_DATA
        }

        const requestUrl = buildOrdersApiUrl(pageOverride, queryOverrides)
        const requestKey = requestUrl
        const useFullLoader = !hasLoadedOrdersRef.current
        const cachedResponse = ordersCacheRef.current.get(requestKey)

        if (
            preferCache &&
            !manualRefresh &&
            !silent &&
            cachedResponse &&
            Date.now() - cachedResponse.cachedAt < ORDERS_CACHE_STALE_MS
        ) {
            latestOrdersQueryKeyRef.current = requestKey
            setData(cachedResponse.data)
            setOrdersReady(true)
            setError("")
            setSyncWarning("")
            return cachedResponse.data
        }

        if (useFullLoader && !silent) {
            setAuthState("checking")
        }

        if (silent) {
            if (
                latestOrdersQueryKeyRef.current &&
                latestOrdersQueryKeyRef.current !== requestKey
            ) {
                return undefined
            }
        } else {
            latestOrdersQueryKeyRef.current = requestKey
        }

        if (!latestOrdersQueryKeyRef.current) {
            latestOrdersQueryKeyRef.current = requestKey
        }

        if (notifyOnNew) {
            pendingNewOrderNotificationRef.current = true
        }

        if (manualRefresh) {
            setRefreshing(true)
        } else if (!silent) {
            if (useFullLoader) {
                setLoading(true)
            } else {
                setOrdersPageLoading(true)
            }
        }

        try {
            /*
             * Silent auto-sync never starts a second request. It may reuse the
             * active request only when that request is for the same page and
             * the same server-side filters.
             */
            if (silent && ordersLoadPromiseRef.current) {
                if (ordersLoadKeyRef.current === requestKey) {
                    return await ordersLoadPromiseRef.current
                }

                return undefined
            }

            if (
                !silent &&
                ordersLoadPromiseRef.current &&
                ordersLoadKeyRef.current !== requestKey
            ) {
                ordersAbortControllerRef.current?.abort()
            }

            /*
             * Manual/page/filter requests are serialized. After waiting, stale
             * queued requests are discarded so an older filter cannot replace
             * a newer response.
             */
            while (ordersLoadPromiseRef.current) {
                await ordersLoadPromiseRef.current
            }

            if (requestKey !== latestOrdersQueryKeyRef.current) {
                return undefined
            }

            setError("")
            const abortController = new AbortController()
            ordersAbortControllerRef.current = abortController

            const currentRequest = (async (): Promise<
                AdminResponse | undefined
            > => {
                try {
                    const response = await authenticatedFetch(requestUrl, {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        signal: abortController.signal,
                    })

                    const json = await response.json().catch(() => null)

                    if (!response.ok) {
                        if (response.status === 401) {
                            return undefined
                        }

                        if (response.status === 403) {
                            clearAuthStorage()
                            redirectToLogin()
                            return undefined
                        }

                        throw new Error(
                            json?.error || `API Error ${response.status}`
                        )
                    }

                    const nextData = json as AdminResponse
                    ordersCacheRef.current.set(requestKey, {
                        data: nextData,
                        cachedAt: Date.now(),
                    })

                    if (requestKey !== latestOrdersQueryKeyRef.current) {
                        return nextData
                    }

                    const shouldNotifyOnNew =
                        pendingNewOrderNotificationRef.current
                    const latestOrder = nextData.latestOrder || null
                    const previousLatestOrderId = latestOrderIdRef.current
                    const previousTotalOrders = knownTotalOrdersRef.current

                    pendingNewOrderNotificationRef.current = false

                    if (
                        shouldNotifyOnNew &&
                        initialOrdersLoadedRef.current &&
                        latestOrder &&
                        previousLatestOrderId &&
                        latestOrder.id !== previousLatestOrderId
                    ) {
                        const addedOrders =
                            previousTotalOrders === null
                                ? 1
                                : Math.max(
                                      1,
                                      nextData.summary.totalOrders -
                                          previousTotalOrders
                                  )

                        showNewOrderToast(latestOrder, addedOrders)
                    }

                    latestOrderIdRef.current = latestOrder?.id || null
                    knownTotalOrdersRef.current =
                        nextData.summary.totalOrders ?? null
                    initialOrdersLoadedRef.current = true
                    hasLoadedOrdersRef.current = true

                    setAuthState("authenticated")
                    setData(nextData)
                    setOrdersReady(true)
                    setError("")
                    setSyncWarning("")

                    const pendingFocusId = pendingOrderFocusRef.current

                    if (pendingFocusId) {
                        pendingOrderFocusRef.current = null

                        setExpandedOrders((current) => ({
                            ...current,
                            [pendingFocusId]: true,
                        }))

                        window.setTimeout(() => {
                            document
                                .getElementById(`order-${pendingFocusId}`)
                                ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                })
                        }, 160)
                    }

                    return nextData
                } catch (err: any) {
                    if (
                        err?.name === "AbortError" ||
                        abortController.signal.aborted
                    ) {
                        return undefined
                    }

                    console.error("Admin dashboard error:", err)

                    if (err instanceof AuthRedirectError) {
                        setAuthState("redirecting")
                        return undefined
                    }

                    const message =
                        err?.message || "Unable to load admin orders."

                    if (hasLoadedOrdersRef.current) {
                        setSyncWarning(
                            silent
                                ? "Auto-sync temporarily failed. Showing the last successfully loaded data. Retrying automatically."
                                : `${message} Showing the last successfully loaded data.`
                        )
                    } else {
                        setAuthState("error")
                        setError(message)
                    }

                    return undefined
                }
            })()

            ordersLoadPromiseRef.current = currentRequest
            ordersLoadKeyRef.current = requestKey

            try {
                return await currentRequest
            } finally {
                if (ordersLoadPromiseRef.current === currentRequest) {
                    ordersLoadPromiseRef.current = null
                    ordersLoadKeyRef.current = null
                }

                if (ordersAbortControllerRef.current === abortController) {
                    ordersAbortControllerRef.current = null
                }
            }
        } finally {
            if (!silent) {
                if (useFullLoader) {
                    setLoading(false)
                } else {
                    setOrdersPageLoading(false)
                }
            }

            if (manualRefresh) {
                setRefreshing(false)
            }
        }
    }

    async function loadReleases(manualRefresh = false): Promise<void> {
        if (isCanvas) {
            setReleases(MOCK_RELEASES)
            hasLoadedReleasesRef.current = true
            return
        }

        if (releasesLoadPromiseRef.current) {
            return await releasesLoadPromiseRef.current
        }

        const useLoader = manualRefresh || !hasLoadedReleasesRef.current

        if (useLoader) setReleaseLoading(true)
        setReleaseError("")

        const currentRequest = (async () => {
            try {
                const response = await authenticatedFetch(ADMIN_RELEASES_API, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                    },
                })

                const json = await response.json().catch(() => null)

                if (!response.ok) {
                    if (response.status === 401) {
                        return
                    }

                    if (response.status === 403) {
                        clearAuthStorage()
                        redirectToLogin()
                        return
                    }

                    throw new Error(
                        json?.error || `API Error ${response.status}`
                    )
                }

                setReleases(json?.releases || json?.data || [])
                hasLoadedReleasesRef.current = true
            } catch (err: any) {
                console.error("Admin releases error:", err)
                setReleaseError(err?.message || "Unable to load releases.")
            } finally {
                if (useLoader) setReleaseLoading(false)
            }
        })()

        releasesLoadPromiseRef.current = currentRequest

        try {
            await currentRequest
        } finally {
            if (releasesLoadPromiseRef.current === currentRequest) {
                releasesLoadPromiseRef.current = null
            }
        }
    }

    function showNewOrderToast(newestOrder: LatestOrder, count = 1) {
        setNewOrderToast({
            orderId: newestOrder.id,
            orderNumber: orderDisplayNumber(newestOrder),
            customerName: newestOrder.customer_name || "Customer",
            source: titleCase(newestOrder.source),
            total: formatMoney(newestOrder.amount_total, newestOrder.currency),
            count,
        })

        if (toastTimerRef.current) {
            window.clearTimeout(toastTimerRef.current)
        }

        toastTimerRef.current = window.setTimeout(() => {
            setNewOrderToast(null)
            toastTimerRef.current = null
        }, 10000)
    }

    async function viewRealtimeOrder(orderId: string) {
        pendingOrderFocusRef.current = orderId
        skipNextOrdersQueryEffectRef.current = true

        setSearch("")
        setDebouncedSearch("")
        setStatusFilter("all")
        setDeadlineFilter("all")
        setOrderReleaseStatusFilter("all")
        setCurrentPage(1)
        setNewOrderToast(null)

        await loadOrders(false, false, false, 1, {
            status: "all",
            deadline: "all",
        })
    }

    /* =====================================================
       AUTH REDIRECT GATE
    ===================================================== */

    useEffect(() => {
        if (isCanvas || typeof window === "undefined") return

        const handleAuthRedirect = () => {
            allowNavigationRef.current = true
            setAuthState("redirecting")
            setLoading(true)
        }

        window.addEventListener(ADMIN_AUTH_REDIRECT_EVENT, handleAuthRedirect)

        return () => {
            window.removeEventListener(
                ADMIN_AUTH_REDIRECT_EVENT,
                handleAuthRedirect
            )
        }
    }, [isCanvas])

    /* =====================================================
       INITIAL LOAD
    ===================================================== */

    useEffect(() => {
        if (isCanvas) {
            setData(MOCK_DATA)
            setLoading(false)
            setOrdersReady(true)
            return
        }

        // The protected orders API independently verifies the bearer token and
        // active admin membership, so a separate /api/admin/verify round trip
        // would only duplicate authorization and delay the first render.
        void loadOrders(false, false, false, 1)
    }, [isCanvas])

    /* =====================================================
       LAZY LOAD RELEASES
    ===================================================== */

    useEffect(() => {
        if (isCanvas || hasLoadedReleasesRef.current) {
            return
        }

        /*
         * Releases are also required on the main order dashboard so each
         * order can show whether customer release content has been received.
         */
        void loadReleases()
    }, [isCanvas])

    /* =====================================================
       SERVER-SIDE PAGE / FILTER LOAD
    ===================================================== */

    useEffect(() => {
        if (isCanvas || !ordersReady || activeTab !== "dashboard") return

        if (!hasInitializedOrdersQueryEffectRef.current) {
            hasInitializedOrdersQueryEffectRef.current = true
            return
        }

        if (skipNextOrdersQueryEffectRef.current) {
            skipNextOrdersQueryEffectRef.current = false
            return
        }

        void loadOrders(false, false, false, currentPage, {}, true)
    }, [
        isCanvas,
        ordersReady,
        activeTab,
        currentPage,
        statusFilter,
        deadlineFilter,
    ])

    /* =====================================================
       SECURE AUTO-SYNC FALLBACK
    ===================================================== */

    useEffect(() => {
        if (isCanvas || !ordersReady || activeTab !== "dashboard") return

        setSyncMode("auto")

        let cancelled = false

        const scheduleNextPoll = () => {
            refreshTimerRef.current = window.setTimeout(async () => {
                if (cancelled) return

                await loadOrders(false, true, true, currentPage)

                if (!cancelled) {
                    scheduleNextPoll()
                }
            }, 20000)
        }

        scheduleNextPoll()

        return () => {
            cancelled = true

            if (refreshTimerRef.current) {
                window.clearTimeout(refreshTimerRef.current)
                refreshTimerRef.current = null
            }

            if (toastTimerRef.current) {
                window.clearTimeout(toastTimerRef.current)
                toastTimerRef.current = null
            }
        }
    }, [
        isCanvas,
        ordersReady,
        activeTab,
        currentPage,
        statusFilter,
        deadlineFilter,
    ])

    /* =====================================================
       SERVER-SIDE ORDER DATA
    ===================================================== */

    const overdueOrderCount = data?.summary.overdueOrders ?? 0

    const loadedOrders = data?.orders || []

    const searchFilteredOrders = useMemo(() => {
        const normalizedSearch = debouncedSearch.trim().toLowerCase()

        if (!normalizedSearch) return loadedOrders

        return loadedOrders.filter((order) => {
            const searchableValues = [
                order.id,
                order.order_number,
                order.external_order_id,
                order.customer_name,
                order.customer_email,
                order.company,
                order.source,
                order.payment_status,
                order.order_status,
                ...(order.items || []).flatMap((item) => [
                    item.id,
                    item.product_id,
                    item.product_name,
                    item.item_status,
                    item.delivery_text,
                    item.published_url,
                ]),
            ]

            return searchableValues.some((value) =>
                String(value || "")
                    .toLowerCase()
                    .includes(normalizedSearch)
            )
        })
    }, [debouncedSearch, loadedOrders])

    const displayedOrders = useMemo(() => {
        if (orderReleaseStatusFilter === "all") {
            return searchFilteredOrders
        }

        return searchFilteredOrders.filter((order) => {
            const releaseReceived = orderHasReceivedRelease(order, releases)

            return orderReleaseStatusFilter === "received"
                ? releaseReceived
                : !releaseReceived
        })
    }, [orderReleaseStatusFilter, releases, searchFilteredOrders])

    const pagination = data?.pagination
    const hasReleaseStatusFilter = orderReleaseStatusFilter !== "all"
    const hasLocalSearch = Boolean(debouncedSearch.trim())
    const hasClientSideOrderFilter =
        hasReleaseStatusFilter || hasLocalSearch

    const totalMatchingOrders = hasClientSideOrderFilter
        ? displayedOrders.length
        : (pagination?.total ?? displayedOrders.length)

    const totalPages = hasClientSideOrderFilter
        ? 1
        : Math.max(
              1,
              pagination?.totalPages ??
                  Math.ceil(totalMatchingOrders / ORDERS_PER_PAGE)
          )

    const resolvedLimit = pagination?.limit ?? ORDERS_PER_PAGE

    const pageStart =
        totalMatchingOrders === 0
            ? 0
            : hasClientSideOrderFilter
              ? 1
              : (currentPage - 1) * resolvedLimit + 1

    const pageEnd = hasClientSideOrderFilter
        ? displayedOrders.length
        : Math.min(currentPage * resolvedLimit, totalMatchingOrders)

    useEffect(() => {
        if (!hasLocalSearch && currentPage > totalPages) {
            setCurrentPage(totalPages)
        }
    }, [currentPage, hasLocalSearch, totalPages])

    const releaseSummary = useMemo(() => {
        const total = releases.length

        const pending = releases.filter(
            (release) =>
                normalizeAdminReleaseStatus(release.admin_status) ===
                "pending_review"
        ).length

        const processing = releases.filter((release) => {
            const userStatus = normalizeUserReleaseStatus(release.status)
            const adminStatus = normalizeAdminReleaseStatus(
                release.admin_status
            )

            return userStatus === "processing" || adminStatus === "processing"
        }).length

        const completed = releases.filter((release) => {
            const userStatus = normalizeUserReleaseStatus(release.status)
            const adminStatus = normalizeAdminReleaseStatus(
                release.admin_status
            )

            return userStatus === "completed" || adminStatus === "completed"
        }).length

        return { total, pending, processing, completed }
    }, [releases])

    const filteredReleases = useMemo(() => {
        if (releaseStatusFilter === "all") return releases

        return releases.filter((release) => {
            const userStatus = normalizeUserReleaseStatus(release.status)
            const adminStatus = normalizeAdminReleaseStatus(
                release.admin_status
            )

            if (releaseStatusFilter === "submitted") {
                return userStatus === "submitted"
            }

            if (releaseStatusFilter === "pending") {
                return adminStatus === "pending_review"
            }

            if (releaseStatusFilter === "processing") {
                return (
                    userStatus === "processing" || adminStatus === "processing"
                )
            }

            if (releaseStatusFilter === "published") {
                return userStatus === "published"
            }

            if (releaseStatusFilter === "completed") {
                return userStatus === "completed" || adminStatus === "completed"
            }

            return false
        })
    }, [releases, releaseStatusFilter])

    /* =====================================================
       UNSAVED CHANGES
    ===================================================== */

    const hasUnsavedOrderChanges =
        Object.keys(statusDrafts).length > 0 ||
        Object.keys(urlDrafts).length > 0 ||
        Object.keys(dateDrafts).length > 0

    const hasUnsavedChanges = hasUnsavedOrderChanges || hasUnsavedReleaseChanges

    useEffect(() => {
        if (isCanvas || !hasUnsavedChanges || typeof window === "undefined") {
            return
        }

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (allowNavigationRef.current) return

            event.preventDefault()
            event.returnValue = ""
        }

        window.addEventListener("beforeunload", handleBeforeUnload)

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload)
        }
    }, [isCanvas, hasUnsavedChanges])

    /* =====================================================
       ACTIONS
    ===================================================== */

    async function copyExternalOrderId(
        orderId: string,
        externalId?: string | null
    ) {
        const value = String(externalId || "").trim()

        if (!value || isCanvas || typeof document === "undefined") {
            return
        }

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value)
            } else {
                throw new Error("Clipboard API unavailable")
            }
        } catch {
            const temporaryInput = document.createElement("textarea")
            temporaryInput.value = value
            temporaryInput.setAttribute("readonly", "")
            temporaryInput.style.position = "fixed"
            temporaryInput.style.opacity = "0"
            document.body.appendChild(temporaryInput)
            temporaryInput.select()
            document.execCommand("copy")
            temporaryInput.remove()
        }

        setCopiedExternalOrderId(orderId)

        if (externalIdCopyTimerRef.current) {
            window.clearTimeout(externalIdCopyTimerRef.current)
        }

        externalIdCopyTimerRef.current = window.setTimeout(() => {
            setCopiedExternalOrderId(null)
            externalIdCopyTimerRef.current = null
        }, 2000)
    }

    function hasOwnDraftValue(record: Record<string, string>, itemId: string) {
        return Object.prototype.hasOwnProperty.call(record, itemId)
    }

    function isOrderItemDirty(itemId: string) {
        return (
            hasOwnDraftValue(statusDrafts, itemId) ||
            hasOwnDraftValue(urlDrafts, itemId) ||
            hasOwnDraftValue(dateDrafts, itemId)
        )
    }

    function orderHasUnsavedChanges(order: Order) {
        return (order.items || []).some((item) => isOrderItemDirty(item.id))
    }

    function updateStatusDraft(item: OrderItem, value: string) {
        setStatusDrafts((current) => {
            const next = { ...current }

            if (value === (item.item_status || "")) {
                delete next[item.id]
            } else {
                next[item.id] = value
            }

            return next
        })
    }

    function updateUrlDraft(item: OrderItem, value: string) {
        const originalValue = item.published_url || ""

        setUrlDrafts((current) => {
            const next = { ...current }

            if (value === originalValue) {
                delete next[item.id]
            } else {
                next[item.id] = value
            }

            return next
        })
    }

    function updateDateDraft(item: OrderItem, value: string) {
        const originalValue = toDateInputValue(item.expected_completion_at)

        setDateDrafts((current) => {
            const next = { ...current }

            if (value === originalValue) {
                delete next[item.id]
            } else {
                next[item.id] = value
            }

            return next
        })
    }

    function clearOrderItemDrafts(itemId: string) {
        setStatusDrafts((current) => {
            if (!Object.prototype.hasOwnProperty.call(current, itemId)) {
                return current
            }

            const next = { ...current }
            delete next[itemId]
            return next
        })

        setUrlDrafts((current) => {
            if (!Object.prototype.hasOwnProperty.call(current, itemId)) {
                return current
            }

            const next = { ...current }
            delete next[itemId]
            return next
        })

        setDateDrafts((current) => {
            if (!Object.prototype.hasOwnProperty.call(current, itemId)) {
                return current
            }

            const next = { ...current }
            delete next[itemId]
            return next
        })
    }

    function clearOrderDrafts(orderId: string) {
        const order = data?.orders?.find((current) => current.id === orderId)

        if (!order) return

        for (const item of order.items || []) {
            clearOrderItemDrafts(item.id)
        }
    }

    function clearAllOrderDrafts() {
        setStatusDrafts({})
        setUrlDrafts({})
        setDateDrafts({})
    }

    function toggleOrderImmediately(id: string) {
        setExpandedOrders((current) => ({
            ...current,
            [id]: !current[id],
        }))
    }

    function requestToggleOrder(order: Order) {
        const expanded = !!expandedOrders[order.id]

        if (expanded && orderHasUnsavedChanges(order)) {
            setPendingUnsavedAction({
                type: "collapse-order",
                orderId: order.id,
            })
            return
        }

        toggleOrderImmediately(order.id)
    }

    function requestTabChange(nextTab: AdminTab) {
        if (nextTab === activeTab) return

        const currentTabHasUnsavedChanges =
            activeTab === "dashboard"
                ? hasUnsavedOrderChanges
                : hasUnsavedReleaseChanges

        if (currentTabHasUnsavedChanges) {
            setPendingUnsavedAction({
                type: "tab-change",
                tab: nextTab,
            })
            return
        }

        activateTab(nextTab)
    }

    function activateTab(nextTab: AdminTab) {
        if (nextTab === "dashboard") {
            const defaultOrdersKey = buildOrdersApiUrl(1, {
                status: "all",
                deadline: "all",
            })
            const cachedDefaultOrders =
                ordersCacheRef.current.get(defaultOrdersKey)
            const cacheIsFresh = Boolean(
                cachedDefaultOrders &&
                    Date.now() - cachedDefaultOrders.cachedAt <
                        ORDERS_CACHE_STALE_MS
            )

            latestOrdersQueryKeyRef.current = defaultOrdersKey
            skipNextOrdersQueryEffectRef.current = cacheIsFresh

            if (
                ordersLoadPromiseRef.current &&
                ordersLoadKeyRef.current !== defaultOrdersKey
            ) {
                ordersAbortControllerRef.current?.abort()
            }

            if (cachedDefaultOrders) {
                setData(cachedDefaultOrders.data)
                setOrdersReady(true)
                setOrdersPageLoading(false)
                setError("")
                setSyncWarning("")
            }

            setSearch("")
            setDebouncedSearch("")
            setStatusFilter("all")
            setDeadlineFilter("all")
            setOrderReleaseStatusFilter("all")
            setCurrentPage(1)
        }

        setActiveTab(nextTab)
    }

    function performLogout() {
        if (isCanvas) return

        allowNavigationRef.current = true
        clearAuthStorage()
        redirectToLogin()
    }

    function requestLogout() {
        if (isCanvas) return

        if (hasUnsavedChanges) {
            setPendingUnsavedAction({ type: "logout" })
            return
        }

        performLogout()
    }

    function confirmDiscardAndContinue() {
        const action = pendingUnsavedAction

        if (!action) return

        setPendingUnsavedAction(null)

        if (action.type === "collapse-order") {
            clearOrderDrafts(action.orderId)

            setExpandedOrders((current) => ({
                ...current,
                [action.orderId]: false,
            }))

            return
        }

        if (action.type === "tab-change") {
            if (activeTab === "dashboard") {
                clearAllOrderDrafts()
            }

            activateTab(action.tab)
            return
        }

        if (action.type === "logout") {
            allowNavigationRef.current = true
            clearAllOrderDrafts()
            setHasUnsavedReleaseChanges(false)
            performLogout()
        }
    }

    const unsavedDialogCopy = pendingUnsavedAction
        ? pendingUnsavedAction.type === "collapse-order"
            ? {
                  title: "Unsaved Changes",
                  message:
                      "This order has changes that have not been saved yet. Collapsing it now will discard those edits.",
                  confirmLabel: "Discard Changes",
              }
            : pendingUnsavedAction.type === "tab-change"
              ? {
                    title: "Unsaved Changes",
                    message:
                        "You have changes that have not been saved yet. Switching sections now will discard those edits.",
                    confirmLabel: "Discard & Continue",
                }
              : {
                    title: "Unsaved Changes",
                    message:
                        "You have changes that have not been saved yet. Logging out now will discard those edits.",
                    confirmLabel: "Discard & Logout",
                }
        : null

    async function saveItemUpdate(item: OrderItem) {
        if (isCanvas) return

        const nextStatus = statusDrafts[item.id] || item.item_status

        const nextUrl = urlDrafts[item.id] ?? item.published_url ?? ""

        const nextExpectedDate =
            dateDrafts[item.id] ?? toDateInputValue(item.expected_completion_at)

        setSavingItemId(item.id)

        setItemMessages((current) => ({
            ...current,
            [item.id]: "",
        }))

        try {
            const response = await authenticatedFetch(
                `${UPDATE_ITEM_API}/${encodeURIComponent(item.id)}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        item_status: nextStatus,
                        published_url: nextUrl.trim() || null,
                        expected_completion_at: nextExpectedDate || null,
                    }),
                }
            )

            const json = await response.json()

            if (!response.ok) {
                if (response.status === 401) {
                    return
                }

                if (response.status === 403) {
                    throw new Error("This account does not have admin access.")
                }

                throw new Error(json?.error || `API Error ${response.status}`)
            }

            setItemMessages((current) => ({
                ...current,
                [item.id]: `Saved ✓ Item: ${titleCase(
                    json.item?.item_status
                )} · Order: ${titleCase(json.order?.order_status)}`,
            }))

            clearOrderItemDrafts(item.id)

            await loadOrders(true)
        } catch (err: any) {
            setItemMessages((current) => ({
                ...current,
                [item.id]: err?.message || "Unable to update this item.",
            }))
        } finally {
            setSavingItemId(null)
        }
    }

    /* =====================================================
       AUTH GATE + LOADING
    ===================================================== */

    if (!isCanvas && authState !== "authenticated") {
        const isAuthError = authState === "error"

        return (
            <div className="adminLoading">
                <style>{styles}</style>

                {!isAuthError && <div className="loader" />}

                <span>
                    {authState === "redirecting"
                        ? "Redirecting to sign in..."
                        : isAuthError
                          ? error ||
                            "Unable to verify your admin session right now."
                          : "Checking admin session..."}
                </span>

                {isAuthError && (
                    <button
                        type="button"
                        className="authRetryButton"
                        onClick={() => {
                            setError("")
                            setAuthState("checking")
                            setLoading(true)
                            void loadOrders(false, false, false, 1)
                        }}
                    >
                        Retry
                    </button>
                )}
            </div>
        )
    }

    if (loading) {
        return (
            <div className="adminLoading">
                <style>{styles}</style>

                <div className="loader" />

                <span>Loading admin dashboard...</span>
            </div>
        )
    }

    /* =====================================================
       MAIN UI
    ===================================================== */

    return (
        <div className="adminPage">
            <style>{styles}</style>

            {newOrderToast &&
                typeof document !== "undefined" &&
                createPortal(
                    <div
                        className="newOrderToast"
                        role="status"
                        aria-live="polite"
                    >
                        <button
                            className="toastClose"
                            type="button"
                            aria-label="Close notification"
                            onClick={() => setNewOrderToast(null)}
                        >
                            ×
                        </button>

                        <div className="toastIcon">✓</div>

                        <div className="toastContent">
                            <span className="toastEyebrow">
                                {newOrderToast.count > 1
                                    ? `${newOrderToast.count} NEW ORDERS RECEIVED`
                                    : "NEW ORDER RECEIVED"}
                            </span>

                            <strong>{newOrderToast.orderNumber}</strong>

                            <p>
                                {newOrderToast.customerName} ·{" "}
                                {newOrderToast.source}
                                {" · "}
                                {newOrderToast.total}
                            </p>

                            <button
                                className="toastViewButton"
                                type="button"
                                onClick={() =>
                                    viewRealtimeOrder(newOrderToast.orderId)
                                }
                            >
                                View Order →
                            </button>
                        </div>
                    </div>,
                    document.body
                )}

            {pendingUnsavedAction &&
                unsavedDialogCopy &&
                typeof document !== "undefined" &&
                createPortal(
                    <div
                        className="unsavedModalBackdrop"
                        role="presentation"
                        onMouseDown={(event) => {
                            if (event.currentTarget === event.target) {
                                setPendingUnsavedAction(null)
                            }
                        }}
                    >
                        <div
                            className="unsavedModal"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="unsavedModalTitle"
                            onMouseDown={(event) => event.stopPropagation()}
                        >
                            <div className="unsavedModalIcon">!</div>

                            <div className="unsavedModalContent">
                                <div className="unsavedModalEyebrow">
                                    ACTION REQUIRED
                                </div>

                                <h2 id="unsavedModalTitle">
                                    {unsavedDialogCopy.title}
                                </h2>

                                <p>{unsavedDialogCopy.message}</p>
                            </div>

                            <div className="unsavedModalActions">
                                <button
                                    type="button"
                                    className="unsavedKeepButton"
                                    onClick={() =>
                                        setPendingUnsavedAction(null)
                                    }
                                >
                                    Keep Editing
                                </button>

                                <button
                                    type="button"
                                    className="unsavedDiscardButton"
                                    onClick={confirmDiscardAndContinue}
                                >
                                    {unsavedDialogCopy.confirmLabel}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

            <div className="adminShell">
                <AdminSidebar
                    activeTab={activeTab}
                    onTabChange={requestTabChange}
                    adminName={
                        data?.admin?.name || data?.admin?.email || "Admin"
                    }
                    onLogout={requestLogout}
                    isCanvas={isCanvas}
                />

                <main className="adminMain">
                    <div className="adminContainer">
                        {/* HEADER */}

                        {activeTab === "dashboard" && (
                            <header className="adminHeader">
                                <div>
                                    <div className="eyebrow">
                                        <span className="eyebrowDot" />
                                        ROCKET PRESS WIRE
                                    </div>

                                    <h1>Admin Dashboard</h1>

                                    <p>
                                        Manage orders, releases, and publishing
                                        progress from one workspace.
                                    </p>

                                    {data?.admin?.email && (
                                        <div className="adminIdentity">
                                            Signed in as{" "}
                                            <strong>
                                                {data.admin.name ||
                                                    data.admin.email}
                                            </strong>
                                        </div>
                                    )}
                                </div>

                                <div className="headerButtons">
                                    <div className={`syncBadge ${syncMode}`}>
                                        <span className="syncDot" />
                                        {syncMode === "realtime"
                                            ? "Live Sync"
                                            : syncMode === "auto"
                                              ? "Auto Sync"
                                              : "Connecting"}
                                    </div>

                                    <button
                                        className="refreshButton"
                                        type="button"
                                        disabled={
                                            refreshing ||
                                            ordersPageLoading ||
                                            isCanvas
                                        }
                                        onClick={() => {
                                            void loadOrders(true)

                                            if (hasLoadedReleasesRef.current) {
                                                void loadReleases(true)
                                            }
                                        }}
                                    >
                                        <span
                                            className={refreshing ? "spin" : ""}
                                        >
                                            ↻
                                        </span>

                                        {refreshing ? "Refreshing" : "Refresh"}
                                    </button>

                                    <button
                                        type="button"
                                        className="logoutButton"
                                        disabled={isCanvas}
                                        onClick={requestLogout}
                                    >
                                        Logout
                                    </button>
                                </div>
                            </header>
                        )}

                        {/* ERROR */}

                        {error && (
                            <div className="errorBox">
                                <div>
                                    <strong>Unable to load dashboard</strong>

                                    <span>{error}</span>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => loadOrders()}
                                >
                                    Retry
                                </button>
                            </div>
                        )}

                        {syncWarning && data && activeTab === "dashboard" && (
                            <div
                                className="syncWarningBox"
                                role="status"
                                aria-live="polite"
                            >
                                <div>
                                    <strong>
                                        Sync temporarily unavailable
                                    </strong>
                                    <span>{syncWarning}</span>
                                </div>

                                <button
                                    type="button"
                                    disabled={refreshing}
                                    onClick={() => loadOrders(true)}
                                >
                                    {refreshing ? "Retrying..." : "Retry Now"}
                                </button>
                            </div>
                        )}

                        {!error && data && activeTab === "dashboard" && (
                            <>
                                {/* SUMMARY */}

                                <section className="summaryGrid">
                                    <SummaryCard
                                        label="Total Orders"
                                        value={data.summary.totalOrders}
                                        icon="▣"
                                    />

                                    <SummaryCard
                                        label="Processing"
                                        value={data.summary.processing}
                                        icon="◷"
                                    />

                                    <SummaryCard
                                        label="Published"
                                        value={data.summary.published}
                                        icon="↗"
                                    />

                                    <SummaryCard
                                        label="Overdue"
                                        value={overdueOrderCount}
                                        icon="!"
                                    />

                                    <SummaryCard
                                        label="Completed"
                                        value={data.summary.completed}
                                        icon="✓"
                                    />

                                    <SummaryCard
                                        label="Total Revenue"
                                        value={formatMoney(
                                            data.summary.totalRevenue,
                                            "usd"
                                        )}
                                        icon="$"
                                    />
                                </section>

                                {/* ORDER PANEL */}

                                <section className="ordersPanel">
                                    <div className="ordersTop">
                                        <div>
                                            <div className="sectionLabel">
                                                ORDER MANAGEMENT
                                            </div>

                                            <h2>All Orders</h2>
                                        </div>

                                        <span className="resultsCount">
                                            {totalMatchingOrders === 0
                                                ? "0 orders"
                                                : `${pageStart}-${pageEnd} of ${totalMatchingOrders} orders`}
                                        </span>
                                    </div>

                                    {/* FILTERS */}

                                    <div className="filters">
                                        <DashboardSearchBox
                                            value={search}
                                            appliedValue={debouncedSearch}
                                            onApply={applyDashboardSearch}
                                        />

                                        <select
                                            value={statusFilter}
                                            onChange={(e) => {
                                                setStatusFilter(e.target.value)
                                                setCurrentPage(1)
                                            }}
                                        >
                                            <option value="all">
                                                All Statuses
                                            </option>

                                            <option value="processing">
                                                Processing
                                            </option>

                                            <option value="published">
                                                Published
                                            </option>

                                            <option value="completed">
                                                Completed
                                            </option>
                                        </select>

                                        <select
                                            value={deadlineFilter}
                                            onChange={(e) => {
                                                setDeadlineFilter(
                                                    e.target.value
                                                )
                                                setCurrentPage(1)
                                            }}
                                        >
                                            <option value="all">
                                                All Deadlines
                                            </option>

                                            <option value="overdue">
                                                Overdue
                                            </option>

                                            <option value="due-today">
                                                Due Today
                                            </option>

                                            <option value="due-soon">
                                                Due Soon
                                            </option>

                                            <option value="on-track">
                                                On Track
                                            </option>

                                            <option value="none">
                                                No Expected Date
                                            </option>
                                        </select>

                                        <select
                                            value={orderReleaseStatusFilter}
                                            disabled={releaseLoading}
                                            onChange={(event) => {
                                                setOrderReleaseStatusFilter(
                                                    event.target.value
                                                )
                                                setCurrentPage(1)
                                            }}
                                        >
                                            <option value="all">
                                                Release Statuses
                                            </option>

                                            <option value="pending">
                                                Pending
                                            </option>

                                            <option value="received">
                                                Received
                                            </option>
                                        </select>
                                    </div>

                                    {/* DESKTOP HEADER */}

                                    <div className="tableHeader">
                                        <span>ORDER</span>

                                        <span>CUSTOMER</span>

                                        <span>DATE</span>

                                        <span>TOTAL</span>

                                        <span>ORDER STATUS</span>

                                        <span>RELEASE STATUS</span>

                                        <span />
                                    </div>

                                    {/* ORDERS */}

                                    {ordersPageLoading && (
                                        <div className="ordersLoadingNotice">
                                            <span className="miniLoader" />
                                            Loading orders...
                                        </div>
                                    )}

                                    <div
                                        className={
                                            ordersPageLoading
                                                ? "orderList loading"
                                                : "orderList"
                                        }
                                    >
                                        {displayedOrders.map((order) => {
                                            const expanded =
                                                !!expandedOrders[order.id]

                                            const overdueItemsCount =
                                                getOrderOverdueItemCount(order)
                                            const releaseOutletDisplay =
                                                getOrderReleaseOutletDisplay(
                                                    order,
                                                    releases
                                                )

                                            return (
                                                <article
                                                    id={`order-${order.id}`}
                                                    className="orderCard"
                                                    key={order.id}
                                                >
                                                    <div className="orderRow">
                                                        <div className="orderMainCell">
                                                            <div className="orderIcon">
                                                                ▣
                                                            </div>

                                                            <div className="orderText">
                                                                <strong
                                                                    title={orderDisplayNumber(
                                                                        order
                                                                    )}
                                                                    style={{
                                                                        display:
                                                                            "block",
                                                                        maxWidth:
                                                                            "100px",
                                                                        overflow:
                                                                            "hidden",
                                                                        textOverflow:
                                                                            "ellipsis",
                                                                        whiteSpace:
                                                                            "nowrap",
                                                                    }}
                                                                >
                                                                    {orderDisplayNumber(
                                                                        order
                                                                    )}
                                                                </strong>

                                                                <span>
                                                                    {order.items
                                                                        ?.length ||
                                                                        0}{" "}
                                                                    item(s)
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="customerCell">
                                                            <span className="mobileLabel">
                                                                Customer
                                                            </span>

                                                            <strong>
                                                                {order.customer_name ||
                                                                    "Customer"}
                                                            </strong>

                                                            <span className="customerEmail">
                                                                {
                                                                    order.customer_email
                                                                }
                                                            </span>
                                                        </div>

                                                        <div className="responsiveCell">
                                                            <span className="mobileLabel">
                                                                Date
                                                            </span>

                                                            <strong className="dateValue">
                                                                {formatDate(
                                                                    order.created_at
                                                                )}
                                                            </strong>
                                                        </div>

                                                        <div className="responsiveCell">
                                                            <span className="mobileLabel">
                                                                Total
                                                            </span>

                                                            <strong className="amountValue">
                                                                {formatMoney(
                                                                    order.amount_total,
                                                                    order.currency
                                                                )}
                                                            </strong>
                                                        </div>

                                                        <div className="responsiveCell">
                                                            <span className="mobileLabel">
                                                                Order Status
                                                            </span>

                                                            <StatusBadge
                                                                status={
                                                                    order.order_status
                                                                }
                                                            />
                                                        </div>

                                                        <div className="responsiveCell">
                                                            <span className="mobileLabel">
                                                                Release Status
                                                            </span>

                                                            <StatusBadge
                                                                status={
                                                                    orderHasReceivedRelease(
                                                                        order,
                                                                        releases
                                                                    )
                                                                        ? "received"
                                                                        : "pending"
                                                                }
                                                            />
                                                        </div>

                                                        <div className="orderActionCell">
                                                            {overdueItemsCount >
                                                                0 && (
                                                                <span className="orderOverdueWarning">
                                                                    {
                                                                        overdueItemsCount
                                                                    }{" "}
                                                                    OVERDUE{" "}
                                                                    {overdueItemsCount ===
                                                                    1
                                                                        ? "ITEM"
                                                                        : "ITEMS"}
                                                                </span>
                                                            )}

                                                            <button
                                                                className="viewButton"
                                                                type="button"
                                                                onClick={() =>
                                                                    requestToggleOrder(
                                                                        order
                                                                    )
                                                                }
                                                            >
                                                                {expanded
                                                                    ? "Hide Details"
                                                                    : "View Details"}

                                                                <span>
                                                                    {expanded
                                                                        ? "↑"
                                                                        : "↓"}
                                                                </span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {expanded && (
                                                        <div className="details">
                                                            <div className="detailsMeta">
                                                                <MetaBlock
                                                                    label="Order Number"
                                                                    value={orderDisplayNumber(
                                                                        order
                                                                    )}
                                                                />

                                                                <MetaBlock
                                                                    label="Payment"
                                                                    value={titleCase(
                                                                        order.payment_status
                                                                    )}
                                                                />

                                                                <div
                                                                    className="metaBlock"
                                                                    title={
                                                                        releaseOutletDisplay.title
                                                                    }
                                                                >
                                                                    <span>
                                                                        Release
                                                                        Outlets
                                                                    </span>

                                                                    <strong>
                                                                        {
                                                                            releaseOutletDisplay.label
                                                                        }
                                                                    </strong>
                                                                </div>

                                                                <div className="metaBlock externalReferenceBlock">
                                                                    <span>
                                                                        Payment
                                                                        Reference
                                                                    </span>

                                                                    <div
                                                                        className="externalReferenceRow"
                                                                        title={
                                                                            order.external_order_id ||
                                                                            "No payment reference"
                                                                        }
                                                                    >
                                                                        <strong>
                                                                            {getShortExternalId(
                                                                                order.external_order_id
                                                                            )}
                                                                        </strong>

                                                                        {order.external_order_id && (
                                                                            <button
                                                                                type="button"
                                                                                className="copyReferenceButton"
                                                                                disabled={
                                                                                    isCanvas
                                                                                }
                                                                                onClick={() =>
                                                                                    copyExternalOrderId(
                                                                                        order.id,
                                                                                        order.external_order_id
                                                                                    )
                                                                                }
                                                                            >
                                                                                {copiedExternalOrderId ===
                                                                                order.id
                                                                                    ? "Copied ✓"
                                                                                    : "Copy"}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="itemsTitle">
                                                                ORDER ITEMS
                                                            </div>

                                                            <div className="itemsList">
                                                                {order.items?.map(
                                                                    (item) => {
                                                                        const draftStatus =
                                                                            statusDrafts[
                                                                                item
                                                                                    .id
                                                                            ] ||
                                                                            item.item_status

                                                                        const draftUrl =
                                                                            urlDrafts[
                                                                                item
                                                                                    .id
                                                                            ] ??
                                                                            item.published_url ??
                                                                            ""

                                                                        const draftExpectedDate =
                                                                            dateDrafts[
                                                                                item
                                                                                    .id
                                                                            ] ??
                                                                            toDateInputValue(
                                                                                item.expected_completion_at
                                                                            )

                                                                        const saving =
                                                                            savingItemId ===
                                                                            item.id

                                                                        const deadline =
                                                                            getDeadlineState(
                                                                                item.expected_completion_at,
                                                                                item.item_status
                                                                            )

                                                                        return (
                                                                            <div
                                                                                className="itemCard"
                                                                                key={
                                                                                    item.id
                                                                                }
                                                                            >
                                                                                <div className="itemProduct">
                                                                                    <div className="productLetter">
                                                                                        {item.product_name
                                                                                            ?.charAt(
                                                                                                0
                                                                                            )
                                                                                            .toUpperCase() ||
                                                                                            "P"}
                                                                                    </div>

                                                                                    <div>
                                                                                        <strong>
                                                                                            {
                                                                                                item.product_name
                                                                                            }
                                                                                        </strong>

                                                                                        <span>
                                                                                            {
                                                                                                item.product_id
                                                                                            }
                                                                                        </span>
                                                                                    </div>
                                                                                </div>

                                                                                <ItemInfo
                                                                                    label="Quantity"
                                                                                    value={String(
                                                                                        item.quantity
                                                                                    )}
                                                                                />

                                                                                <ItemInfo
                                                                                    label="Delivery"
                                                                                    value={
                                                                                        item.delivery_text ||
                                                                                        "—"
                                                                                    }
                                                                                />

                                                                                <DeadlineInfo
                                                                                    date={
                                                                                        item.expected_completion_at
                                                                                    }
                                                                                    deadline={
                                                                                        deadline
                                                                                    }
                                                                                />

                                                                                <ItemInfo
                                                                                    label="Price"
                                                                                    value={formatMoney(
                                                                                        item.unit_amount,
                                                                                        order.currency
                                                                                    )}
                                                                                />

                                                                                <StatusBadge
                                                                                    status={
                                                                                        item.item_status
                                                                                    }
                                                                                />

                                                                                {item.published_url ? (
                                                                                    <a
                                                                                        href={
                                                                                            item.published_url
                                                                                        }
                                                                                        target="_blank"
                                                                                        rel="noreferrer"
                                                                                        className="publishedLink"
                                                                                    >
                                                                                        View
                                                                                        URL
                                                                                        ↗
                                                                                    </a>
                                                                                ) : (
                                                                                    <span className="noUrl">
                                                                                        No
                                                                                        URL
                                                                                    </span>
                                                                                )}

                                                                                <div className="itemAdminControls">
                                                                                    <div className="controlGroup">
                                                                                        <label>
                                                                                            Update
                                                                                            Status
                                                                                        </label>

                                                                                        <select
                                                                                            value={
                                                                                                draftStatus
                                                                                            }
                                                                                            onChange={(
                                                                                                e
                                                                                            ) =>
                                                                                                updateStatusDraft(
                                                                                                    item,
                                                                                                    e
                                                                                                        .target
                                                                                                        .value
                                                                                                )
                                                                                            }
                                                                                        >
                                                                                            <option value="processing">
                                                                                                Processing
                                                                                            </option>

                                                                                            <option value="published">
                                                                                                Published
                                                                                            </option>

                                                                                            <option value="completed">
                                                                                                Completed
                                                                                            </option>
                                                                                        </select>
                                                                                    </div>

                                                                                    <div className="controlGroup dateControl">
                                                                                        <label>
                                                                                            Expected
                                                                                            Date
                                                                                        </label>

                                                                                        <input
                                                                                            type="date"
                                                                                            value={
                                                                                                draftExpectedDate
                                                                                            }
                                                                                            onChange={(
                                                                                                e
                                                                                            ) =>
                                                                                                updateDateDraft(
                                                                                                    item,
                                                                                                    e
                                                                                                        .target
                                                                                                        .value
                                                                                                )
                                                                                            }
                                                                                        />
                                                                                    </div>

                                                                                    <div className="controlGroup urlControl">
                                                                                        <label>
                                                                                            Published
                                                                                            URL
                                                                                        </label>

                                                                                        <input
                                                                                            type="url"
                                                                                            value={
                                                                                                draftUrl
                                                                                            }
                                                                                            onChange={(
                                                                                                e
                                                                                            ) =>
                                                                                                updateUrlDraft(
                                                                                                    item,
                                                                                                    e
                                                                                                        .target
                                                                                                        .value
                                                                                                )
                                                                                            }
                                                                                            placeholder="https://example.com/live-article"
                                                                                        />
                                                                                    </div>

                                                                                    <button
                                                                                        type="button"
                                                                                        className="saveItemButton"
                                                                                        disabled={
                                                                                            saving ||
                                                                                            isCanvas
                                                                                        }
                                                                                        onClick={() =>
                                                                                            saveItemUpdate(
                                                                                                item
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        {saving
                                                                                            ? "Saving..."
                                                                                            : "Save Update"}
                                                                                    </button>

                                                                                    {itemMessages[
                                                                                        item
                                                                                            .id
                                                                                    ] && (
                                                                                        <div className="itemMessage">
                                                                                            {
                                                                                                itemMessages[
                                                                                                    item
                                                                                                        .id
                                                                                                ]
                                                                                            }
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )
                                                                    }
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </article>
                                            )
                                        })}

                                        {!ordersPageLoading &&
                                            displayedOrders.length === 0 && (
                                                <div className="emptyState">
                                                    <strong>
                                                        No orders found
                                                    </strong>

                                                    <span>
                                                        Try changing your search
                                                        or filters.
                                                    </span>
                                                </div>
                                            )}
                                    </div>

                                    {totalPages > 1 && (
                                        <div className="pagination">
                                            <button
                                                type="button"
                                                className="paginationButton"
                                                disabled={
                                                    ordersPageLoading ||
                                                    currentPage === 1
                                                }
                                                onClick={() => {
                                                    setCurrentPage((page) =>
                                                        Math.max(1, page - 1)
                                                    )

                                                    document
                                                        .querySelector(
                                                            ".ordersPanel"
                                                        )
                                                        ?.scrollIntoView({
                                                            behavior: "smooth",
                                                            block: "start",
                                                        })
                                                }}
                                            >
                                                ← Previous
                                            </button>

                                            <div className="paginationInfo">
                                                <span>Page</span>
                                                <strong>{currentPage}</strong>
                                                <span>of</span>
                                                <strong>{totalPages}</strong>
                                            </div>

                                            <button
                                                type="button"
                                                className="paginationButton"
                                                disabled={
                                                    ordersPageLoading ||
                                                    currentPage === totalPages
                                                }
                                                onClick={() => {
                                                    setCurrentPage((page) =>
                                                        Math.min(
                                                            totalPages,
                                                            page + 1
                                                        )
                                                    )

                                                    document
                                                        .querySelector(
                                                            ".ordersPanel"
                                                        )
                                                        ?.scrollIntoView({
                                                            behavior: "smooth",
                                                            block: "start",
                                                        })
                                                }}
                                            >
                                                Next →
                                            </button>
                                        </div>
                                    )}
                                </section>
                            </>
                        )}

                        {!error && activeTab === "total-releases" && (
                            <TotalReleasesView
                                releases={filteredReleases}
                                allReleases={releases}
                                summary={releaseSummary}
                                loading={releaseLoading}
                                error={releaseError}
                                statusFilter={releaseStatusFilter}
                                onStatusFilterChange={setReleaseStatusFilter}
                                onRefresh={() => loadReleases(true)}
                                onSaved={() => loadReleases(true)}
                                onDirtyChange={setHasUnsavedReleaseChanges}
                            />
                        )}
                    </div>
                </main>
            </div>
        </div>
    )
}

function AdminSidebar({
    activeTab,
    onTabChange,
    adminName,
    onLogout,
    isCanvas,
}: {
    activeTab: AdminTab
    onTabChange: (tab: AdminTab) => void
    adminName: string
    onLogout: () => void
    isCanvas: boolean
}) {
    return (
        <aside className="adminSidebar">
            <div className="sidebarBrand">
                <div className="sidebarLogo">R</div>
                <div>
                    <strong>Rocket Press Wire</strong>
                    <span>Admin Workspace</span>
                </div>
            </div>

            <div className="sidebarGroup">
                <div className="sidebarLabel">Overview</div>
                <button
                    type="button"
                    className={
                        activeTab === "dashboard"
                            ? "sidebarNav active"
                            : "sidebarNav"
                    }
                    onClick={() => onTabChange("dashboard")}
                >
                    <span>▣</span>
                    Dashboard
                </button>
            </div>

            <div className="sidebarGroup">
                <div className="sidebarLabel">Press Releases</div>
                <button
                    type="button"
                    className={
                        activeTab === "total-releases"
                            ? "sidebarNav active"
                            : "sidebarNav"
                    }
                    onClick={() => onTabChange("total-releases")}
                >
                    <span>↗</span>
                    Total Releases
                </button>
            </div>

            <div className="sidebarProfile">
                <span>Signed in</span>
                <strong>{adminName}</strong>
            </div>

            <button
                type="button"
                className="sidebarLogout"
                disabled={isCanvas}
                onClick={onLogout}
            >
                Logout
            </button>
        </aside>
    )
}

const DashboardSearchBox = React.memo(function DashboardSearchBox({
    value,
    appliedValue,
    onApply,
}: {
    value: string
    appliedValue: string
    onApply: (inputValue: string, normalizedValue: string) => void
}) {
    const [inputValue, setInputValue] = useState(value)

    useEffect(() => {
        setInputValue(value)
    }, [value])

    useEffect(() => {
        const normalizedValue = inputValue.trim().slice(0, 100)

        if (normalizedValue === appliedValue) return

        const debounceTimer = window.setTimeout(() => {
            onApply(inputValue, normalizedValue)
        }, 300)

        return () => window.clearTimeout(debounceTimer)
    }, [appliedValue, inputValue, onApply])

    return (
        <div className="searchBox">
            <span>⌕</span>
            <input
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder="Search order, customer, email or product..."
            />
        </div>
    )
})

function TotalReleasesView({
    releases,
    allReleases,
    summary,
    loading,
    error,
    statusFilter,
    onStatusFilterChange,
    onRefresh,
    onSaved,
    onDirtyChange,
}: {
    releases: AdminRelease[]
    allReleases: AdminRelease[]
    summary: {
        total: number
        pending: number
        processing: number
        completed: number
    }
    loading: boolean
    error: string
    statusFilter: string
    onStatusFilterChange: (value: string) => void
    onRefresh: () => void
    onSaved: () => void
    onDirtyChange: (dirty: boolean) => void
}) {
    const RELEASES_PER_PAGE = 12
    const [search, setSearch] = useState("")
    const [currentPage, setCurrentPage] = useState(1)
    const [expandedReleases, setExpandedReleases] = useState<
        Record<string, boolean>
    >({})
    const [drafts, setDrafts] = useState<
        Record<
            string,
            Partial<AdminRelease> & { live_article_links_text?: string }
        >
    >({})
    const [savingReleaseId, setSavingReleaseId] = useState<string | null>(null)
    const [releaseMessages, setReleaseMessages] = useState<
        Record<string, string>
    >({})
    const [downloadingSourceDocumentId, setDownloadingSourceDocumentId] =
        useState<string | null>(null)

    const matchingReleases = useMemo(() => {
        const normalizedSearch = search.trim().toLocaleLowerCase()

        if (!normalizedSearch) return releases

        return releases.filter((release) =>
            [
                release.title,
                release.contact_name,
                release.contact_email,
                release.user_email,
                release.company,
                release.order_number,
            ].some((value) =>
                String(value || "")
                    .toLocaleLowerCase()
                    .includes(normalizedSearch)
            )
        )
    }, [releases, search])

    const totalMatchingReleases = matchingReleases.length
    const totalPages = Math.max(
        1,
        Math.ceil(totalMatchingReleases / RELEASES_PER_PAGE)
    )
    const pageStart =
        totalMatchingReleases === 0
            ? 0
            : (currentPage - 1) * RELEASES_PER_PAGE + 1
    const pageEnd = Math.min(
        currentPage * RELEASES_PER_PAGE,
        totalMatchingReleases
    )
    const paginatedReleases = useMemo(() => {
        const start = (currentPage - 1) * RELEASES_PER_PAGE

        return matchingReleases.slice(start, start + RELEASES_PER_PAGE)
    }, [currentPage, matchingReleases])

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages)
        }
    }, [currentPage, totalPages])

    const hasUnsavedChanges = useMemo(() => {
        return allReleases.some((release) => {
            if (!drafts[release.id]) return false

            const draft = getDraft(release)

            const original = {
                status: normalizeUserReleaseStatus(release.status),
                admin_status: normalizeAdminReleaseStatus(release.admin_status),
                published_url: release.published_url || "",
                report_title: release.report_title ?? release.title ?? "",
                report_pdf_url: release.report_pdf_url || "",
                report_excel_url: release.report_excel_url || "",
                live_article_links_text: (
                    release.live_article_links || []
                ).join("\n"),
                admin_notes: release.admin_notes || "",
            }

            return (
                draft.status !== original.status ||
                draft.admin_status !== original.admin_status ||
                draft.published_url !== original.published_url ||
                draft.report_title !== original.report_title ||
                draft.report_pdf_url !== original.report_pdf_url ||
                draft.report_excel_url !== original.report_excel_url ||
                draft.live_article_links_text !==
                    original.live_article_links_text ||
                draft.admin_notes !== original.admin_notes
            )
        })
    }, [allReleases, drafts])

    useEffect(() => {
        onDirtyChange(hasUnsavedChanges)

        return () => {
            onDirtyChange(false)
        }
    }, [hasUnsavedChanges, onDirtyChange])

    function toggleRelease(id: string) {
        setExpandedReleases((current) => ({
            ...current,
            [id]: !current[id],
        }))
    }

    function getDraft(release: AdminRelease) {
        const currentDraft = drafts[release.id] || {}

        return {
            status: normalizeUserReleaseStatus(
                currentDraft.status ?? release.status
            ),
            admin_status: normalizeAdminReleaseStatus(
                currentDraft.admin_status ?? release.admin_status
            ),
            published_url:
                currentDraft.published_url ?? release.published_url ?? "",
            report_title:
                currentDraft.report_title ??
                release.report_title ??
                release.title ??
                "",
            report_pdf_url:
                currentDraft.report_pdf_url ?? release.report_pdf_url ?? "",
            report_excel_url:
                currentDraft.report_excel_url ?? release.report_excel_url ?? "",
            live_article_links_text:
                currentDraft.live_article_links_text ??
                (release.live_article_links || []).join("\n"),
            admin_notes: currentDraft.admin_notes ?? release.admin_notes ?? "",
        }
    }

    function updateDraft(id: string, key: string, value: string) {
        setDrafts((current) => ({
            ...current,
            [id]: {
                ...(current[id] || {}),
                [key]: value,
            },
        }))
    }

    function removeReport(releaseId: string, type: "pdf" | "excel") {
        const key = type === "pdf" ? "report_pdf_url" : "report_excel_url"

        updateDraft(releaseId, key, "")

        setReleaseMessages((current) => ({
            ...current,
            [releaseId]: `${type.toUpperCase()} report marked for removal. Click Save Release Update to remove it from the user portal.`,
        }))
    }

    async function downloadSourceDocument(release: AdminRelease) {
        if (!release.source_document_path) return

        setDownloadingSourceDocumentId(release.id)
        setReleaseMessages((current) => ({
            ...current,
            [release.id]: "Preparing secure source document download...",
        }))

        try {
            const response = await authenticatedFetch(
                `${ADMIN_RELEASES_API}/${encodeURIComponent(
                    release.id
                )}/source-document`,
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            )

            const json = await response.json().catch(() => null)

            if (!response.ok) {
                if (response.status === 401) {
                    return
                }

                if (response.status === 403) {
                    throw new Error("This account does not have admin access.")
                }

                throw new Error(
                    json?.error ||
                        `Unable to prepare document download: ${response.status}`
                )
            }

            const signedUrl = String(json?.url || "").trim()
            const fileName = String(
                json?.name || release.source_document_name || "source-document"
            ).trim()

            if (!signedUrl) {
                throw new Error(
                    "The document is attached, but a secure download URL was not returned."
                )
            }

            if (typeof document === "undefined") return

            const downloadLink = document.createElement("a")
            downloadLink.href = signedUrl
            downloadLink.target = "_blank"
            downloadLink.rel = "noopener noreferrer"
            downloadLink.download = fileName || "source-document"
            document.body.appendChild(downloadLink)
            downloadLink.click()
            downloadLink.remove()

            setReleaseMessages((current) => ({
                ...current,
                [release.id]:
                    "Secure source document download opened successfully.",
            }))
        } catch (err: any) {
            setReleaseMessages((current) => ({
                ...current,
                [release.id]:
                    err?.message || "Unable to download source document.",
            }))
        } finally {
            setDownloadingSourceDocumentId(null)
        }
    }

    async function uploadReportFile(
        release: AdminRelease,
        type: "pdf" | "excel",
        file?: File | null
    ) {
        if (!file) return

        setSavingReleaseId(release.id)
        setReleaseMessages((current) => ({
            ...current,
            [release.id]: `Uploading ${type.toUpperCase()} report...`,
        }))

        try {
            const formData = new FormData()
            formData.append("file", file)
            formData.append("releaseId", release.id)
            formData.append("type", type)

            const response = await authenticatedFetch(
                ADMIN_RELEASE_REPORT_API,
                {
                    method: "POST",
                    body: formData,
                }
            )

            const json = await response.json().catch(() => null)

            if (!response.ok) {
                if (response.status === 401) {
                    return
                }

                throw new Error(
                    json?.error || `Upload failed: ${response.status}`
                )
            }

            const url = json?.url || json?.publicUrl || ""

            if (!url) {
                throw new Error(
                    "Upload finished but report URL was not returned."
                )
            }

            updateDraft(
                release.id,
                type === "pdf" ? "report_pdf_url" : "report_excel_url",
                url
            )

            setReleaseMessages((current) => ({
                ...current,
                [release.id]: `${type.toUpperCase()} report uploaded. Click Save Release Update to publish it to the user portal.`,
            }))
        } catch (err: any) {
            setReleaseMessages((current) => ({
                ...current,
                [release.id]: err?.message || "Unable to upload report.",
            }))
        } finally {
            setSavingReleaseId(null)
        }
    }

    async function saveReleaseUpdate(release: AdminRelease) {
        const draft = getDraft(release)

        setSavingReleaseId(release.id)
        setReleaseMessages((current) => ({ ...current, [release.id]: "" }))

        try {
            const liveLinks = draft.live_article_links_text
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean)

            const response = await authenticatedFetch(
                `${ADMIN_RELEASES_API}/${encodeURIComponent(release.id)}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        status: draft.status,
                        admin_status: draft.admin_status,
                        published_url: draft.published_url.trim() || null,
                        live_article_links: liveLinks,
                        report_title: draft.report_title.trim() || null,
                        report_pdf_url: draft.report_pdf_url.trim() || null,
                        report_excel_url: draft.report_excel_url.trim() || null,
                        admin_notes: draft.admin_notes.trim() || null,
                    }),
                }
            )

            const json = await response.json().catch(() => null)

            if (!response.ok) {
                if (response.status === 401) {
                    return
                }

                if (response.status === 403) {
                    throw new Error("This account does not have admin access.")
                }

                throw new Error(json?.error || `API Error ${response.status}`)
            }

            setReleaseMessages((current) => ({
                ...current,
                [release.id]:
                    "Saved ✓ User portal will now show updated status/report if report URLs are added.",
            }))

            setDrafts((current) => {
                if (!current[release.id]) return current

                const next = { ...current }
                delete next[release.id]
                return next
            })

            await onSaved()
        } catch (err: any) {
            setReleaseMessages((current) => ({
                ...current,
                [release.id]: err?.message || "Unable to update this release.",
            }))
        } finally {
            setSavingReleaseId(null)
        }
    }

    return (
        <>
            <section className="releaseSummaryGrid">
                <SummaryCard label="Total" value={summary.total} icon="▣" />
                <SummaryCard label="Pending" value={summary.pending} icon="!" />
                <SummaryCard
                    label="In Processing"
                    value={summary.processing}
                    icon="◷"
                />
                <SummaryCard
                    label="Completed"
                    value={summary.completed}
                    icon="✓"
                />
            </section>

            <section className="ordersPanel releasesPanel">
                <div className="ordersTop">
                    <div>
                        <div className="sectionLabel">TOTAL RELEASES</div>
                        <h2>Submitted Releases</h2>
                    </div>
                    <span className="resultsCount">
                        {totalMatchingReleases === 0
                            ? "0 releases"
                            : `${pageStart}-${pageEnd} of ${totalMatchingReleases} releases`}
                    </span>
                </div>

                <div className="releaseFilters">
                    <div className="searchBox">
                        <span>⌕</span>
                        <input
                            value={search}
                            aria-label="Search releases"
                            onChange={(event) => {
                                setSearch(event.target.value)
                                setCurrentPage(1)
                            }}
                            placeholder="Search release, customer, email, company or order ID..."
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(event) => {
                            onStatusFilterChange(event.target.value)
                            setCurrentPage(1)
                        }}
                    >
                        <option value="all">All Releases</option>
                        <option value="submitted">Submitted</option>
                        <option value="pending">Pending</option>
                        <option value="processing">In Processing</option>
                        <option value="published">Published</option>
                        <option value="completed">Completed</option>
                    </select>
                </div>

                {error && (
                    <div className="errorBox releaseErrorBox">
                        <div>
                            <strong>Unable to load releases</strong>
                            <span>{error}</span>
                        </div>
                        <button type="button" onClick={onRefresh}>
                            Retry
                        </button>
                    </div>
                )}

                {loading && (
                    <div className="emptyState">
                        <strong>Loading releases...</strong>
                    </div>
                )}

                {!error && !loading && paginatedReleases.length > 0 && (
                    <div className="releaseTableHeader">
                        <span>Release</span>
                        <span>Customer</span>
                        <span>Status</span>
                        <span>Date</span>
                        <span>Order ID</span>
                        <span />
                    </div>
                )}

                {!error && !loading && paginatedReleases.length === 0 && (
                    <div className="emptyState">
                        <strong>No releases found</strong>
                        <span>
                            Try changing your search or filter.
                        </span>
                    </div>
                )}

                <div className="releaseList">
                    {!loading &&
                        paginatedReleases.map((release) => {
                            const expanded = !!expandedReleases[release.id]
                            const draft = getDraft(release)
                            const hasReport = Boolean(
                                draft.report_pdf_url || draft.report_excel_url
                            )
                            const saving = savingReleaseId === release.id
                            const outletDisplay =
                                getAdminReleaseOutletDisplay(release)
                            const writingOption =
                                release.writing_option === "own"
                                    ? "Write Your Own"
                                    : release.writing_option === "journalist"
                                      ? "Journalist Writing"
                                      : "—"

                            return (
                                <article
                                    className="releaseCard"
                                    key={release.id}
                                >
                                    <div className="releaseRow">
                                        <div className="releaseMainCell">
                                            <div className="orderIcon">↗</div>
                                            <div className="orderText">
                                                <strong>
                                                    {release.title ||
                                                        "Untitled Release"}
                                                </strong>
                                                <span>
                                                    {release.website_url ||
                                                        "No website URL"}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="responsiveCell">
                                            <span className="mobileLabel">
                                                Customer
                                            </span>
                                            <strong className="dateValue">
                                                {release.contact_name ||
                                                    release.user_email ||
                                                    "Customer"}
                                            </strong>
                                            {release.contact_email && (
                                                <span className="customerEmail">
                                                    {release.contact_email}
                                                </span>
                                            )}
                                        </div>

                                        <div className="responsiveCell">
                                            <span className="mobileLabel">
                                                Status
                                            </span>
                                            <StatusBadge
                                                status={getReleaseDisplayStatus(
                                                    release
                                                )}
                                            />
                                        </div>

                                        <div className="responsiveCell">
                                            <span className="mobileLabel">
                                                Date
                                            </span>
                                            <strong className="dateValue">
                                                {formatDate(release.created_at)}
                                            </strong>
                                        </div>

                                        <div className="responsiveCell">
                                            <span className="mobileLabel">
                                                Order ID
                                            </span>
                                            <strong className="dateValue">
                                                {release.order_number || "—"}
                                            </strong>
                                            {hasReport && (
                                                <span className="reportMiniBadge">
                                                    Report Ready
                                                </span>
                                            )}
                                            {release.source_document_path && (
                                                <span className="reportMiniBadge sourceFileMiniBadge">
                                                    Source File
                                                </span>
                                            )}
                                        </div>

                                        <button
                                            className={
                                                expanded
                                                    ? "viewButton active"
                                                    : "viewButton"
                                            }
                                            type="button"
                                            onClick={() =>
                                                toggleRelease(release.id)
                                            }
                                        >
                                            {expanded
                                                ? "Hide Details"
                                                : "All Details"}
                                            <span>{expanded ? "↑" : "↓"}</span>
                                        </button>
                                    </div>

                                    {expanded && (
                                        <div className="releaseDetailsAdmin">
                                            <div className="releaseDetailsInfoGridAdmin">
                                                <MetaBlock
                                                    label="Order Number"
                                                    value={
                                                        release.order_number ||
                                                        "—"
                                                    }
                                                />

                                                <div
                                                    className="metaBlock"
                                                    title={outletDisplay.title}
                                                >
                                                    <span>Order Outlet</span>
                                                    <strong>
                                                        {outletDisplay.label}
                                                    </strong>
                                                </div>

                                                <MetaBlock
                                                    label="Writing Option"
                                                    value={writingOption}
                                                />

                                                <MetaBlock
                                                    label="Company"
                                                    value={
                                                        release.company || "—"
                                                    }
                                                />

                                                <MetaBlock
                                                    label="Phone"
                                                    value={release.phone || "—"}
                                                />

                                                <MetaBlock
                                                    label="Customer Email"
                                                    value={
                                                        release.user_email ||
                                                        release.contact_email ||
                                                        "—"
                                                    }
                                                />

                                                <MetaBlock
                                                    label="Title"
                                                    value={release.title || "—"}
                                                />

                                                <MetaBlock
                                                    label="Website"
                                                    value={
                                                        release.website_url ||
                                                        "—"
                                                    }
                                                />

                                                <MetaBlock
                                                    label="Submitted Date"
                                                    value={formatDate(
                                                        release.created_at
                                                    )}
                                                />

                                                <div className="releaseLongBlock full">
                                                    <span>Summary</span>
                                                    <p>
                                                        {release.summary || "—"}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="releaseContentGridAdmin releasePrimaryContentGrid">
                                                {release.featured_image_url && (
                                                    <div className="releaseLongBlock full">
                                                        <span>
                                                            Featured Image
                                                        </span>
                                                        <img
                                                            className="releaseFeaturedImage"
                                                            src={
                                                                release.featured_image_url
                                                            }
                                                            alt="Featured image"
                                                        />
                                                    </div>
                                                )}

                                                {release.source_document_path && (
                                                    <div className="releaseLongBlock full sourceDocumentBlock">
                                                        <span>
                                                            Source Document
                                                        </span>

                                                        <div className="sourceDocumentCard">
                                                            <div className="sourceDocumentInfo">
                                                                <div className="sourceDocumentIcon">
                                                                    ⇩
                                                                </div>

                                                                <div className="sourceDocumentText">
                                                                    <strong>
                                                                        {release.source_document_name ||
                                                                            "Source document"}
                                                                    </strong>
                                                                    <small>
                                                                        {getSourceDocumentTypeLabel(
                                                                            release
                                                                        )}
                                                                        {" · "}
                                                                        {formatFileSize(
                                                                            release.source_document_size_bytes
                                                                        )}
                                                                    </small>
                                                                </div>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                className="sourceDocumentDownloadButton"
                                                                disabled={
                                                                    downloadingSourceDocumentId ===
                                                                    release.id
                                                                }
                                                                onClick={() =>
                                                                    downloadSourceDocument(
                                                                        release
                                                                    )
                                                                }
                                                            >
                                                                {downloadingSourceDocumentId ===
                                                                release.id
                                                                    ? "Preparing..."
                                                                    : "Download Document"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="releaseLongBlock full">
                                                    <span>Content</span>
                                                    <div
                                                        className="releaseHtmlContent"
                                                        dangerouslySetInnerHTML={{
                                                            __html:
                                                                release.content ||
                                                                "—",
                                                        }}
                                                    />
                                                </div>
                                                <div className="releaseLongBlock">
                                                    <span>Categories</span>
                                                    <p>
                                                        {release.categories
                                                            ?.length
                                                            ? release.categories.join(
                                                                  ", "
                                                              )
                                                            : "—"}
                                                    </p>
                                                </div>
                                                <div className="releaseLongBlock">
                                                    <span>Contact Name</span>
                                                    <p>
                                                        {release.contact_name ||
                                                            "—"}
                                                    </p>
                                                </div>
                                                <div className="releaseLongBlock">
                                                    <span>Contact Email</span>
                                                    <p>
                                                        {release.contact_email ||
                                                            "—"}
                                                    </p>
                                                </div>
                                                <div className="releaseLongBlock">
                                                    <span>SEO Title</span>
                                                    <p>
                                                        {release.seo_title ||
                                                            "—"}
                                                    </p>
                                                </div>
                                                <div className="releaseLongBlock">
                                                    <span>Keywords</span>
                                                    <p>
                                                        {release.keywords ||
                                                            "—"}
                                                    </p>
                                                </div>
                                                <div className="releaseLongBlock full">
                                                    <span>
                                                        Meta Description
                                                    </span>
                                                    <p>
                                                        {release.meta_description ||
                                                            "—"}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="releaseAdminControls">
                                                <div className="controlGroup">
                                                    <label>User Status</label>
                                                    <select
                                                        value={String(
                                                            draft.status
                                                        )}
                                                        onChange={(event) =>
                                                            updateDraft(
                                                                release.id,
                                                                "status",
                                                                event.target
                                                                    .value
                                                            )
                                                        }
                                                    >
                                                        <option value="submitted">
                                                            Submitted
                                                        </option>
                                                        <option value="processing">
                                                            In Processing
                                                        </option>
                                                        <option value="published">
                                                            Published
                                                        </option>
                                                        <option value="completed">
                                                            Completed
                                                        </option>
                                                    </select>
                                                </div>

                                                <div className="controlGroup">
                                                    <label>Admin Status</label>
                                                    <select
                                                        value={String(
                                                            draft.admin_status
                                                        )}
                                                        onChange={(event) =>
                                                            updateDraft(
                                                                release.id,
                                                                "admin_status",
                                                                event.target
                                                                    .value
                                                            )
                                                        }
                                                    >
                                                        <option value="pending_review">
                                                            Pending Review
                                                        </option>
                                                        <option value="processing">
                                                            In Processing
                                                        </option>
                                                        <option value="completed">
                                                            Completed
                                                        </option>
                                                    </select>
                                                </div>

                                                <div className="controlGroup urlControl">
                                                    <label>
                                                        Main Published URL
                                                    </label>
                                                    <input
                                                        type="url"
                                                        value={String(
                                                            draft.published_url
                                                        )}
                                                        onChange={(event) =>
                                                            updateDraft(
                                                                release.id,
                                                                "published_url",
                                                                event.target
                                                                    .value
                                                            )
                                                        }
                                                        placeholder="https://example.com/live-article"
                                                    />
                                                </div>

                                                <div className="controlGroup fullControl">
                                                    <label>
                                                        Live Article Links (one
                                                        per line)
                                                    </label>
                                                    <textarea
                                                        value={String(
                                                            draft.live_article_links_text
                                                        )}
                                                        onChange={(event) =>
                                                            updateDraft(
                                                                release.id,
                                                                "live_article_links_text",
                                                                event.target
                                                                    .value
                                                            )
                                                        }
                                                        placeholder="https://usatoday.com/...&#10;https://digitaljournal.com/..."
                                                        rows={4}
                                                    />
                                                </div>

                                                <div className="controlGroup">
                                                    <label>Report Title</label>
                                                    <input
                                                        value={String(
                                                            draft.report_title
                                                        )}
                                                        onChange={(event) =>
                                                            updateDraft(
                                                                release.id,
                                                                "report_title",
                                                                event.target
                                                                    .value
                                                            )
                                                        }
                                                        placeholder="Report title"
                                                    />
                                                </div>

                                                <div className="controlGroup fileControl">
                                                    <label>Excel Report</label>
                                                    <input
                                                        type="file"
                                                        accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                                        onChange={(event) => {
                                                            uploadReportFile(
                                                                release,
                                                                "excel",
                                                                event.target
                                                                    .files?.[0]
                                                            )
                                                            event.currentTarget.value =
                                                                ""
                                                        }}
                                                    />

                                                    {Boolean(
                                                        draft.report_excel_url
                                                    ) && (
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                                flexWrap:
                                                                    "wrap",
                                                                gap: "10px",
                                                                marginTop:
                                                                    "10px",
                                                            }}
                                                        >
                                                            <a
                                                                href={String(
                                                                    draft.report_excel_url
                                                                )}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                style={{
                                                                    marginTop: 0,
                                                                }}
                                                            >
                                                                Excel ready ↗
                                                            </a>

                                                            <button
                                                                type="button"
                                                                disabled={
                                                                    saving
                                                                }
                                                                onClick={() =>
                                                                    removeReport(
                                                                        release.id,
                                                                        "excel"
                                                                    )
                                                                }
                                                                style={{
                                                                    minHeight:
                                                                        "24px",
                                                                    padding:
                                                                        "0 12px",
                                                                    border: "1px solid rgba(255,91,117,.34)",
                                                                    borderRadius:
                                                                        "6px",
                                                                    color: "#ff8b9d",
                                                                    background:
                                                                        "rgba(255,83,111,.14)",
                                                                    fontSize:
                                                                        "11px",
                                                                    fontWeight: 800,
                                                                    cursor: saving
                                                                        ? "default"
                                                                        : "pointer",
                                                                }}
                                                            >
                                                                Remove Excel
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="controlGroup fileControl">
                                                    <label>PDF Report</label>
                                                    <input
                                                        type="file"
                                                        accept="application/pdf,.pdf"
                                                        onChange={(event) => {
                                                            uploadReportFile(
                                                                release,
                                                                "pdf",
                                                                event.target
                                                                    .files?.[0]
                                                            )
                                                            event.currentTarget.value =
                                                                ""
                                                        }}
                                                    />

                                                    {Boolean(
                                                        draft.report_pdf_url
                                                    ) && (
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                                flexWrap:
                                                                    "wrap",
                                                                gap: "10px",
                                                                marginTop:
                                                                    "10px",
                                                            }}
                                                        >
                                                            <a
                                                                href={String(
                                                                    draft.report_pdf_url
                                                                )}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                style={{
                                                                    marginTop: 0,
                                                                }}
                                                            >
                                                                PDF ready ↗
                                                            </a>

                                                            <button
                                                                type="button"
                                                                disabled={
                                                                    saving
                                                                }
                                                                onClick={() =>
                                                                    removeReport(
                                                                        release.id,
                                                                        "pdf"
                                                                    )
                                                                }
                                                                style={{
                                                                    minHeight:
                                                                        "24px",
                                                                    padding:
                                                                        "0 12px",
                                                                    border: "1px solid rgba(255,91,117,.34)",
                                                                    borderRadius:
                                                                        "6px",
                                                                    color: "#ff8b9d",
                                                                    background:
                                                                        "rgba(255,83,111,.14)",
                                                                    fontSize:
                                                                        "11px",
                                                                    fontWeight: 800,
                                                                    cursor: saving
                                                                        ? "default"
                                                                        : "pointer",
                                                                }}
                                                            >
                                                                Remove PDF
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="controlGroup fullControl">
                                                    <label>Admin Notes</label>
                                                    <textarea
                                                        value={String(
                                                            draft.admin_notes
                                                        )}
                                                        onChange={(event) =>
                                                            updateDraft(
                                                                release.id,
                                                                "admin_notes",
                                                                event.target
                                                                    .value
                                                            )
                                                        }
                                                        placeholder="Internal notes for team"
                                                        rows={3}
                                                    />
                                                </div>

                                                <button
                                                    type="button"
                                                    className="saveItemButton releaseSaveButton"
                                                    disabled={saving}
                                                    onClick={() =>
                                                        saveReleaseUpdate(
                                                            release
                                                        )
                                                    }
                                                >
                                                    {saving
                                                        ? "Saving..."
                                                        : "Save Release Update"}
                                                </button>

                                                {releaseMessages[
                                                    release.id
                                                ] && (
                                                    <div className="itemMessage releaseMessage">
                                                        {
                                                            releaseMessages[
                                                                release.id
                                                            ]
                                                        }
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </article>
                            )
                        })}
                </div>

                {totalPages > 1 && (
                    <div className="pagination">
                        <button
                            type="button"
                            className="paginationButton"
                            disabled={currentPage === 1}
                            onClick={() => {
                                setCurrentPage((page) => Math.max(1, page - 1))

                                document
                                    .querySelector(".releasesPanel")
                                    ?.scrollIntoView({
                                        behavior: "smooth",
                                        block: "start",
                                    })
                            }}
                        >
                            ← Previous
                        </button>

                        <div className="paginationInfo">
                            <span>Page</span>
                            <strong>{currentPage}</strong>
                            <span>of</span>
                            <strong>{totalPages}</strong>
                        </div>

                        <button
                            type="button"
                            className="paginationButton"
                            disabled={currentPage === totalPages}
                            onClick={() => {
                                setCurrentPage((page) =>
                                    Math.min(totalPages, page + 1)
                                )

                                document
                                    .querySelector(".releasesPanel")
                                    ?.scrollIntoView({
                                        behavior: "smooth",
                                        block: "start",
                                    })
                            }}
                        >
                            Next →
                        </button>
                    </div>
                )}
            </section>
        </>
    )
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function SummaryCard({
    label,
    value,
    icon,
}: {
    label: string
    value: string | number
    icon: string
}) {
    return (
        <div className="summaryCard">
            <div className="summaryIcon">{icon}</div>

            <div>
                <span>{label}</span>

                <strong>{value}</strong>
            </div>
        </div>
    )
}

function SourceCard({
    title,
    value,
    icon,
    className,
}: {
    title: string
    value: number
    icon: string
    className: string
}) {
    return (
        <div className="sourceCard">
            <div>
                <span>{title}</span>

                <strong>{value}</strong>
            </div>

            <div className={`sourceLogo ${className}`}>{icon}</div>
        </div>
    )
}

function StatusBadge({ status }: { status?: string }) {
    const normalized = (status || "processing").toLowerCase()
    const displayLabel =
        normalized === "processing" ? "In Processing" : titleCase(status)

    return (
        <span className={`statusBadge ${normalized}`}>
            <i />

            {displayLabel}
        </span>
    )
}

function SourceBadge({ source }: { source?: string }) {
    const normalized = (source || "").toLowerCase()

    return (
        <span className={`sourceBadge ${normalized}`}>
            {normalized === "stripe"
                ? "Stripe"
                : normalized === "thrivecart"
                  ? "ThriveCart"
                  : titleCase(source)}
        </span>
    )
}

function MetaBlock({ label, value }: { label: string; value: string }) {
    return (
        <div className="metaBlock">
            <span>{label}</span>

            <strong>{value}</strong>
        </div>
    )
}

function ItemInfo({ label, value }: { label: string; value: string }) {
    return (
        <div className="itemInfo">
            <span>{label}</span>

            <strong>{value}</strong>
        </div>
    )
}

function DeadlineInfo({
    date,
    deadline,
}: {
    date?: string | null
    deadline: DeadlineState
}) {
    return (
        <div className="itemInfo deadlineInfo">
            <span>Expected</span>

            <strong>{formatDate(date)}</strong>

            <em className={`deadlineBadge ${deadline.type}`}>
                {deadline.label}
            </em>
        </div>
    )
}

/* =========================================================
   STYLES
========================================================= */

const styles = `
* {
    box-sizing: border-box;
}

button,
input,
select {
    font: inherit;
}

.adminPage {
    width: 100%;
    min-height: 100vh;

    padding:
        48px 20px 80px;

    color: #ffffff;

    font-family: 'DM Sans';
}

.adminContainer {
    width: 100%;
    max-width: 1500px;

    margin: 0 auto;
}


.adminShell {
    width: 100%;
    max-width: 1680px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
}

.adminMain {
    min-width: 0;
}

.adminSidebar {
    position: sticky;
    top: 24px;
    min-height: calc(100vh - 96px);
    padding: 22px;
    border: 1px solid rgba(255,255,255,.11);
    border-radius: 14px;
    background: rgba(24,14,54,.76);
    backdrop-filter: blur(18px);
}

.sidebarBrand {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 20px;
    margin-bottom: 18px;
    border-bottom: 1px solid rgba(255,255,255,.08);
}

.sidebarLogo {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 8px;
    background: linear-gradient(145deg, #765dff, #4930ca);
    color: #ffffff;
    font-weight: 800;
}

.sidebarBrand strong,
.sidebarProfile strong {
    display: block;
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
}

.sidebarBrand span,
.sidebarProfile span,
.sidebarLabel {
    display: block;
    color: rgba(255,255,255,.45);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1px;
    text-transform: uppercase;
}

.sidebarGroup {
    margin-bottom: 20px;
}

.sidebarLabel {
    margin-bottom: 8px;
}

.sidebarNav,
.sidebarLogout {
    width: 100%;
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    border: 1px solid transparent;
    border-radius: 8px;
    color: rgba(255,255,255,.7);
    background: transparent;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    text-align: left;
}

.sidebarNav span {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 5px;
    color: #aea2ff;
    background: rgba(255,255,255,.06);
    font-size: 10px;
}

.sidebarNav.active {
    color: #ffffff;
    border-color: rgba(128,105,255,.28);
    background: rgba(128,105,255,.14);
}

.sidebarProfile {
    margin-top: 28px;
    padding: 14px 12px;
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 8px;
    background: rgba(255,255,255,.035);
}

.sidebarProfile strong {
    margin-top: 5px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.sidebarLogout {
    justify-content: center;
    margin-top: 12px;
    border-color: rgba(255,255,255,.13);
}

.releaseSummaryGrid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 24px;
}

.releasesPanel {
    margin-top: 0;
}

.releaseFilters {
    display: grid;
    grid-template-columns: minmax(300px, 1fr) 210px;
    gap: 12px;
    margin-bottom: 20px;
}

.releaseFilters select {
    min-width: 210px;
    min-height: 48px;
    padding: 0 46px 0 16px;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 8px;
    color: #ffffff;
    background-color: #1a113b;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 16px center;
    background-size: 14px 14px;
    appearance: none;
    -webkit-appearance: none;
    font-size: 13px;
    font-weight: 700;
}

.releaseTableHeader,
.releaseRow {
    display: grid;
    grid-template-columns: 2fr 1.6fr 0.9fr 0.9fr 1.1fr 0.8fr;
    gap: 16px;
    align-items: center;
}

.releaseTableHeader {
    padding: 0 18px 12px;
    color: rgba(255,255,255,.45);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .8px;
    text-transform: uppercase;
}

.releaseList {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.releaseCard {
    overflow: hidden;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 10px;
    background: rgba(255,255,255,.038);
}

.releaseRow {
    min-height: 86px;
    padding: 17px 18px;
}

.releaseMainCell {
    display: flex;
    align-items: center;
    gap: 13px;
    min-width: 0;
}

.reportReady {
    display: inline-flex;
    width: fit-content;
    padding: 7px 10px;
    border-radius: 999px;
    color: #6ee8aa;
    background: rgba(75,217,145,.12);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
}


.reportMiniBadge {
    display: inline-flex;
    width: fit-content;
    margin-top: 7px;
    padding: 5px 8px;
    border-radius: 999px;
    color: #6ee8aa;
    background: rgba(75,217,145,.12);
    font-size: 8px;
    font-weight: 800;
    text-transform: uppercase;
}

.sourceFileMiniBadge {
    margin-left: 6px;
    color: #b8adff;
    background: rgba(126,103,255,.14);
}

.releaseDetailsAdmin {
    padding: 24px 20px 20px;
    border-top: 1px solid rgba(255,255,255,.08);
    background: rgba(0,0,0,.15);
}

.releaseDetailsGridAdmin {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 18px;
}

.releaseDetailsInfoGridAdmin {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 18px;
}

.releaseDetailsInfoGridAdmin .metaBlock,
.releaseDetailsInfoGridAdmin .releaseLongBlock {
    min-width: 0;
}

.releaseDetailsInfoGridAdmin .metaBlock strong {
    white-space: normal;
    overflow-wrap: anywhere;
}

.releaseContentGridAdmin {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 20px;
}

.releasePrimaryContentGrid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.releaseLongBlock {
    min-width: 0;
    padding: 14px;
    border-radius: 8px;
    background: rgba(255,255,255,.035);
}

.releaseLongBlock.full {
    grid-column: 1 / -1;
}

.releaseLongBlock span {
    display: block;
    margin-bottom: 8px;
    color: rgba(255,255,255,.45);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .6px;
    text-transform: uppercase;
}

.releaseLongBlock p,
.releaseHtmlContent {
    margin: 0;
    color: rgba(255,255,255,.72);
    font-size: 12px;
    line-height: 1.8;
    white-space: normal;
    word-break: break-word;
}

.sourceDocumentBlock {
    border: 1px solid rgba(126,103,255,.16);
    background: rgba(126,103,255,.055);
}

.sourceDocumentCard {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
}

.sourceDocumentInfo {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
}

.sourceDocumentIcon {
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 1px solid rgba(159,143,255,.22);
    border-radius: 8px;
    color: #b8adff;
    background: rgba(126,103,255,.13);
    font-size: 18px;
    font-weight: 800;
}

.sourceDocumentText {
    min-width: 0;
}

.sourceDocumentText strong {
    display: block;
    overflow: hidden;
    color: rgba(255,255,255,.9);
    font-size: 12px;
    font-weight: 800;
    line-height: 1.5;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sourceDocumentText small {
    display: block;
    margin-top: 4px;
    color: rgba(255,255,255,.43);
    font-size: 10px;
    line-height: 1.5;
}

.sourceDocumentDownloadButton {
    min-height: 38px;
    flex-shrink: 0;
    padding: 0 15px;
    border: 1px solid rgba(159,143,255,.28);
    border-radius: 7px;
    color: #ffffff;
    background: rgba(126,103,255,.18);
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
}

.sourceDocumentDownloadButton:hover:not(:disabled) {
    border-color: rgba(174,160,255,.46);
    background: rgba(126,103,255,.28);
}

.sourceDocumentDownloadButton:disabled {
    opacity: .55;
    cursor: default;
}

.releaseHtmlContent p {
    margin: 0 0 12px;
}

.releaseHtmlContent p:last-child {
    margin-bottom: 0;
}

.releaseHtmlContent b,
.releaseHtmlContent strong {
    color: #ffffff;
    font-weight: 800;
}

.releaseHtmlContent i,
.releaseHtmlContent em {
    font-style: italic;
}

.releaseHtmlContent a {
    color: #b3a8ff;
    text-decoration: underline;
}

.releaseHtmlContent ul,
.releaseHtmlContent ol {
    margin: 10px 0 12px;
    padding-left: 22px;
}

.releaseHtmlContent li {
    margin-bottom: 6px;
}

.releaseHtmlContent img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 12px 0;
    border-radius: 8px;
}

.releaseFeaturedImage {
    width: 100%;
    max-width: 520px;
    height: auto;
    display: block;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.1);
}

.releaseAdminControls {
    display: grid;
    grid-template-columns: 2fr 1.5fr 1.5fr;
    gap: 12px;
    align-items: end;
    padding-top: 18px;
    border-top: 1px solid rgba(255,255,255,.08);
}

.releaseAdminControls .fullControl {
    grid-column: 1 / -1;
}

.releaseAdminControls textarea {
    width: 100%;
    min-height: 88px;
    padding: 12px;
    border: 1px solid rgba(255,255,255,.13);
    border-radius: 7px;
    color: #ffffff;
    background: #1a113b;
    font-size: 12px;
    outline: none;
    resize: vertical;
}

.releaseAdminControls .controlGroup select {
    appearance: none;
    -webkit-appearance: none;
    padding: 0 44px 0 12px;
    background-color: #1a113b;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
    background-size: 14px 14px;
}

.fileControl input[type="file"] {
    height: auto;
    min-height: 44px;
    padding: 10px;
    color: rgba(255,255,255,.68);
}

.fileControl a {
    display: inline-flex;
    width: fit-content;
    margin-top: 8px;
    color: #b3a8ff;
    font-size: 11px;
    font-weight: 700;
    text-decoration: none;
}

.releaseSaveButton {
    grid-column: 1 / -1;
    width: fit-content;
    min-width: 190px;
}

.releaseMessage {
    grid-column: 1 / -1;
}

.viewButton.active {
    color: #c5bdff;
    background: rgba(122,97,255,.14);
    border-color: rgba(157,142,255,.3);
}

/* UNSAVED CHANGES MODAL */

.unsavedModalBackdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(5, 2, 18, .74);
    backdrop-filter: blur(8px);
}

.unsavedModal {
    width: min(460px, 100%);
    padding: 24px;
    border: 1px solid rgba(255,255,255,.13);
    border-radius: 14px;
    color: #ffffff;
    background:
        linear-gradient(145deg, rgba(43,29,91,.99), rgba(19,11,48,.99));
    box-shadow:
        0 28px 80px rgba(0,0,0,.5),
        0 0 0 1px rgba(255,255,255,.03) inset;
}

.unsavedModalIcon {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 18px;
    border: 1px solid rgba(255,196,82,.24);
    border-radius: 50%;
    color: #ffd36e;
    background: rgba(255,196,82,.1);
    font-size: 18px;
    font-weight: 800;
}

.unsavedModalEyebrow {
    margin-bottom: 8px;
    color: #a99dff;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1.2px;
}

.unsavedModalContent h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
}

.unsavedModalContent p {
    margin: 12px 0 0;
    color: rgba(255,255,255,.6);
    font-size: 13px;
    line-height: 1.65;
}

.unsavedModalActions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 24px;
}

.unsavedKeepButton,
.unsavedDiscardButton {
    min-height: 44px;
    padding: 0 14px;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}

.unsavedKeepButton {
    border: 1px solid rgba(255,255,255,.14);
    color: #ffffff;
    background: rgba(255,255,255,.05);
}

.unsavedDiscardButton {
    border: 1px solid rgba(255,91,117,.3);
    color: #ffffff;
    background: rgba(255,83,111,.16);
}


/* HEADER */

.adminHeader {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;

    gap: 30px;

    margin-bottom: 32px;
}

.eyebrow {
    display: flex;
    align-items: center;

    gap: 8px;

    margin-bottom: 14px;

    color: #a99dff;

    font-size: 13px;
    font-weight: 700;

    letter-spacing: 1.5px;
}

.eyebrowDot {
    width: 8px;
    height: 8px;

    border-radius: 50%;

    background: #8069ff;

    box-shadow:
        0 0 14px
        rgba(128,105,255,.9);
}

.adminHeader h1 {
    margin: 0;

    font-size:
        clamp(34px,4vw,35px);
   font-weight: 700;
    letter-spacing: -1px;
    font-family: 'DM Sans';
}

.adminHeader p {
    margin:
        14px 0 0;

    color:
        rgba(255,255,255,.62);

    font-size: 16px;
    line-height: 1.6;
}

.adminIdentity {
    margin-top: 12px;

    color:
        rgba(255,255,255,.5);

    font-size: 13px;
}

.adminIdentity strong {
    color:
        rgba(255,255,255,.85);
}

.headerButtons {
    display: flex;
    align-items: center;

    gap: 10px;
}

.syncBadge {
    min-height: 46px;

    display: inline-flex;
    align-items: center;

    gap: 8px;

    padding: 0 13px;

    border: 1px solid rgba(255,255,255,.12);
    border-radius: 8px;

    color: rgba(255,255,255,.72);
    background: rgba(255,255,255,.04);

    font-size: 11px;
    font-weight: 700;
    letter-spacing: .4px;
    text-transform: uppercase;

    white-space: nowrap;
}

.syncDot {
    width: 8px;
    height: 8px;

    flex-shrink: 0;

    border-radius: 50%;

    background: #ffd36e;
    box-shadow: 0 0 12px rgba(255,211,110,.55);
}

.syncBadge.realtime .syncDot {
    background: #6ee8aa;
    box-shadow: 0 0 12px rgba(110,232,170,.65);
}

.syncBadge.auto .syncDot {
    background: #9baeff;
    box-shadow: 0 0 12px rgba(155,174,255,.55);
}

/* NEW ORDER TOAST */

.newOrderToast {
    position: fixed;
    left: 22px;
    bottom: 22px;
    top: auto;
    right: auto;
    z-index: 2147483647;

    width: min(390px, calc(100vw - 28px));

    display: grid;
    grid-template-columns: 46px minmax(0, 1fr);

    gap: 13px;

    padding: 17px 46px 17px 17px;

    border: 1px solid rgba(129,105,255,.34);
    border-radius: 12px;

    color: #ffffff;

    background:
        linear-gradient(145deg, rgba(43,29,91,.98), rgba(19,11,48,.98));

    box-shadow:
        0 22px 55px rgba(0,0,0,.42),
        0 0 0 1px rgba(255,255,255,.03) inset;

    backdrop-filter: blur(18px);

    animation: toastIn .28s ease-out;
}

@keyframes toastIn {
    from {
        opacity: 0;
        transform: translateY(14px) translateX(-12px);
    }

    to {
        opacity: 1;
        transform: translateY(0) translateX(0);
    }
}

.toastIcon {
    width: 46px;
    height: 46px;

    display: flex;
    align-items: center;
    justify-content: center;

    border-radius: 50%;

    color: #6ee8aa;
    background: rgba(75,217,145,.12);
    border: 1px solid rgba(110,232,170,.22);

    font-size: 18px;
    font-weight: 800;
}

.toastContent {
    min-width: 0;
}

.toastEyebrow {
    display: block;

    margin-bottom: 5px;

    color: #9f91ff;

    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1px;
}

.toastContent strong {
    display: block;

    overflow: hidden;

    font-size: 14px;

    white-space: nowrap;
    text-overflow: ellipsis;
}

.toastContent p {
    margin: 6px 0 11px;

    color: rgba(255,255,255,.58);

    font-size: 12px;
    line-height: 1.45;
}

.toastViewButton {
    padding: 0;

    border: 0;

    color: #c3baff;
    background: transparent;

    font-size: 11px;
    font-weight: 700;

    cursor: pointer;
}

.toastClose {
    position: absolute;
    top: 9px;
    right: 10px;

    width: 28px;
    height: 28px;

    border: 0;

    color: rgba(255,255,255,.55);
    background: transparent;

    font-size: 20px;
    line-height: 1;

    cursor: pointer;
}

.refreshButton,
.logoutButton {
    min-height: 46px;

    padding:
        0 18px;

    border:
        1px solid
        rgba(255,255,255,.14);

    border-radius: 8px;

    color: #ffffff;

    background:
        rgba(255,255,255,.05);

    font-size: 13px;
    font-weight: 600;

    cursor: pointer;
}

.refreshButton {
    display: flex;
    align-items: center;

    gap: 8px;
}

.logoutButton {
    background: transparent;
}

button:disabled {
    opacity: .45;
    cursor: default;
}

.spin {
    display: inline-block;

    animation:
        spin 1s linear infinite;
}

@keyframes spin {
    to {
        transform:
            rotate(360deg);
    }
}

/* SUMMARY */

.summaryGrid {
    display: grid;

    grid-template-columns:
        repeat(6, minmax(0,1fr));

    gap: 16px;

    margin-bottom: 16px;
}

.summaryCard {
    min-height: 126px;

    display: flex;
    align-items: center;

    gap: 16px;

    padding: 22px;

    border:
        1px solid
        rgba(255,255,255,.11);

    border-radius: 12px;

    background:
        linear-gradient(
            145deg,
            rgba(68,52,120,.7),
            rgba(26,16,58,.88)
        );
}

.summaryIcon {
    width: 48px;
    height: 48px;

    display: flex;
    align-items: center;
    justify-content: center;

    flex-shrink: 0;

    border-radius: 50%;

    color: #aea2ff;

    background:
        rgba(130,106,255,.14);

    border:
        1px solid
        rgba(160,144,255,.24);

    font-size: 18px;
}

.summaryCard span {
    display: block;

    margin-bottom: 8px;

    color:
        rgba(255,255,255,.56);

    font-size: 12px;
    font-weight: 700;

    text-transform: uppercase;

    letter-spacing: .6px;
}

.summaryCard strong {
    display: block;

    font-size: 22px;
    font-weight: 700;
    font-family: 'DM Sans';
    line-height: 1.1;
}

/* SOURCE */

.sourceGrid {
    display: grid;

    grid-template-columns:
        repeat(2,minmax(0,1fr));

    gap: 16px;

    margin-bottom: 26px;
}

.sourceCard {
    min-height: 92px;

    display: flex;
    align-items: center;
    justify-content: space-between;

    padding:
        20px 22px;

    border:
        1px solid
        rgba(255,255,255,.09);

    border-radius: 10px;

    background:
        rgba(255,255,255,.035);
}

.sourceCard span {
    display: block;

    color:
        rgba(255,255,255,.55);

    font-size: 13px;
    font-weight: 600;
}

.sourceCard strong {
    display: block;

    margin-top: 6px;

     font-size: 22px;
    font-weight: 700;
    font-family: 'DM Sans';
    line-height: 1.1;
}

.sourceLogo {
    width: 44px;
    height: 44px;

    display: flex;
    align-items: center;
    justify-content: center;

    border-radius: 9px;

    font-size: 17px;
    font-weight: 800;
}

.sourceLogo.stripe {
    color: #c1b7ff;

    background:
        rgba(121,99,255,.16);
}

.sourceLogo.thrive {
    color: #79e7b5;

    background:
        rgba(72,213,146,.13);
}

/* PANEL */

.ordersPanel {
    padding: 28px;

    border:
        1px solid
        rgba(255,255,255,.11);

    border-radius: 14px;

    background:
        rgba(24,14,54,.76);
}

.ordersTop {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;

    gap: 20px;

    margin-bottom: 22px;
}

.sectionLabel {
    color: #a397ff;

    font-size: 12px;
    font-weight: 700;

    letter-spacing: 1.4px;
}

.ordersTop h2 {
    margin:
        7px 0 0;

    font-size: 24px;
    font-weight: 700;
}

.resultsCount {
    color:
        rgba(255,255,255,.5);

    font-size: 13px;
}

/* FILTERS */

.filters {
    display: grid;

    grid-template-columns:
        minmax(300px,1fr)
        180px
        180px
        210px;

    gap: 12px;

    margin-bottom: 22px;
}

.searchBox {
    min-height: 50px;

    display: flex;
    align-items: center;

    gap: 10px;

    padding:
        0 15px;

    border:
        1px solid
        rgba(255,255,255,.12);

    border-radius: 8px;

    background:
        rgba(255,255,255,.045);
}

.searchBox span {
    font-size: 18px;

    color:
        rgba(255,255,255,.55);
}

.searchBox input {
    width: 100%;

    border: 0;
    outline: 0;

    color: #ffffff;

    background: transparent;

    font-size: 14px;
}

.searchBox input::placeholder {
    color:
        rgba(255,255,255,.35);
}

.filters select {
    min-height: 50px;

    padding:
        0 46px 0 16px;

    border:
        1px solid
        rgba(255,255,255,.12);

    border-radius: 8px;

    color: #ffffff;

    background-color: #1a113b;

    background-image:
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");

    background-repeat: no-repeat;

    background-position:
        right 16px center;

    background-size:
        14px 14px;

    appearance: none;
    -webkit-appearance: none;

    font-size: 14px;
    font-weight: 600;

    cursor: pointer;
}

/* DESKTOP TABLE */

.tableHeader,
.orderRow {
    display: grid;
   grid-template-columns: 1.6fr 1.5fr 0.8fr 0.7fr 1fr 1fr 0.9fr;
    gap: 18px;
}

.tableHeader {
    padding:
        0 18px 12px;

    color:
        rgba(255,255,255,.45);

    font-size: 11px;
    font-weight: 700;

    letter-spacing: .8px;
}

.ordersLoadingNotice {
    min-height: 42px;

    display: flex;
    align-items: center;

    gap: 9px;

    margin-bottom: 12px;
    padding: 0 14px;

    border: 1px solid rgba(155,174,255,.14);
    border-radius: 8px;

    color: rgba(255,255,255,.64);
    background: rgba(118,93,255,.07);

    font-size: 11px;
    font-weight: 700;
}

.miniLoader {
    width: 15px;
    height: 15px;

    flex-shrink: 0;

    border: 2px solid rgba(255,255,255,.14);
    border-top-color: #9baeff;
    border-radius: 50%;

    animation: spin .8s linear infinite;
}

.orderList {
    display: flex;
    flex-direction: column;

    gap: 12px;

    transition: opacity .18s ease;
}

.orderList.loading {
    opacity: .48;
    pointer-events: none;
}

.orderCard {
    overflow: hidden;

    border:
        1px solid
        rgba(255,255,255,.1);

    border-radius: 10px;

    background:
        rgba(255,255,255,.038);
}

.orderRow {
    min-height: 86px;

    align-items: center;

    padding:
        17px 18px;
}

.orderMainCell {
    display: flex;
    align-items: center;

    gap: 13px;

    min-width: 0;
}

.orderIcon {
    width: 44px;
    height: 44px;

    display: flex;
    align-items: center;
    justify-content: center;

    flex-shrink: 0;

    border-radius: 8px;

    background:
        linear-gradient(
            145deg,
            #765dff,
            #4930ca
        );
}

.orderText,
.customerCell {
    min-width: 0;
}

.orderText strong,
.customerCell strong {
    display: block;

    overflow: hidden;

    color: #ffffff;

    font-size: 14px;
    font-weight: 700;

    white-space: nowrap;
    text-overflow: ellipsis;
}

.orderText span,
.customerEmail {
    display: block;

    margin-top: 6px;

    overflow: hidden;

    color:
        rgba(255,255,255,.5);

    font-size: 12px;

    white-space: nowrap;
    text-overflow: ellipsis;
}

.dateValue {
    color:
        rgba(255,255,255,.85);

    font-size: 13px;
}

.amountValue {
    color: #ffffff;

    font-size: 14px;
    font-weight: 700;
}

.mobileLabel {
    display: none;
}

/* BADGES */

.sourceBadge,
.statusBadge {
    display: inline-flex;
    align-items: center;

    width: fit-content;

    border-radius: 30px;

    white-space: nowrap;
}

.sourceBadge {
    padding:
        8px 11px;

    font-size: 11px;
    font-weight: 700;
}

.sourceBadge.stripe {
    color: #c0b5ff;

    background:
        rgba(125,103,255,.15);
}

.sourceBadge.thrivecart {
    color: #78e8b4;

    background:
        rgba(73,218,150,.12);
}

.statusBadge {
    gap: 7px;

    padding:
        8px 11px;

    font-size: 11px;
    font-weight: 700;

    text-transform: uppercase;
}

.statusBadge i {
    width: 7px;
    height: 7px;

    border-radius: 50%;
}

.statusBadge.processing {
    color: #ffc46c;

    background:
        rgba(255,183,72,.12);
}

.statusBadge.processing i {
    background: #ffc46c;
}

.statusBadge.published {
    color: #83bdff;

    background:
        rgba(77,158,255,.12);
}

.statusBadge.published i {
    background: #83bdff;
}

.statusBadge.completed {
    color: #6ee8aa;

    background:
        rgba(75,217,145,.12);
}

.statusBadge.completed i {
    background: #6ee8aa;
}

.statusBadge.received {
    color: #6ee8aa;
    background: rgba(75,217,145,.12);
}

.statusBadge.received i {
    background: #6ee8aa;
}



.statusBadge.submitted,
.statusBadge.pending,
.statusBadge.pending_review,
.statusBadge.draft,
.statusBadge.in_review,
.statusBadge.current {
    color: #b9adff;
    background: rgba(128,105,255,.14);
}

.statusBadge.submitted i,
.statusBadge.pending i,
.statusBadge.pending_review i,
.statusBadge.draft i,
.statusBadge.in_review i,
.statusBadge.current i {
    background: #a99dff;
}


/* DEADLINE INDICATORS */

.deadlineInfo {
    min-width: 0;
}

.deadlineBadge {
    display: inline-flex;

    width: fit-content;

    margin-top: 7px;

    padding:
        5px 7px;

    border:
        1px solid
        rgba(255,255,255,.08);

    border-radius: 999px;

    font-style: normal;
    font-size: 8px;
    font-weight: 800;

    line-height: 1.2;

    letter-spacing: .25px;

    text-transform: uppercase;

    white-space: normal;
}

.deadlineBadge.overdue {
    color: #ff8b9d;

    background:
        rgba(255,83,111,.12);

    border-color:
        rgba(255,83,111,.2);
}

.deadlineBadge.due-today {
    color: #ffb86b;

    background:
        rgba(255,168,76,.12);

    border-color:
        rgba(255,168,76,.18);
}

.deadlineBadge.due-tomorrow,
.deadlineBadge.due-soon {
    color: #ffd36e;

    background:
        rgba(255,196,82,.11);

    border-color:
        rgba(255,196,82,.17);
}

.deadlineBadge.on-track {
    color: #9baeff;

    background:
        rgba(118,93,255,.10);

    border-color:
        rgba(118,93,255,.18);
}

.deadlineBadge.completed {
    color: #6ee8aa;

    background:
        rgba(75,217,145,.12);

    border-color:
        rgba(75,217,145,.18);
}

.deadlineBadge.none {
    color:
        rgba(255,255,255,.55);

    background:
        rgba(255,255,255,.06);

    border-color:
        rgba(255,255,255,.1);
}

.orderActionCell {
    display: flex;
    flex-direction: column;

    gap: 6px;

    min-width: 0;
}

.orderOverdueWarning {
    display: inline-flex;
    align-items: center;
    justify-content: center;

    width: 100%;

    padding:
        5px 7px;

    border:
        1px solid
        rgba(255,83,111,.2);

    border-radius: 6px;

    color: #ff8b9d;

    background:
        rgba(255,83,111,.1);

    font-size: 8px;
    font-weight: 800;

    line-height: 1.2;

    text-align: center;
    white-space: normal;
}

/* VIEW BUTTON */

.viewButton {
    min-height: 42px;

    display: flex;
    align-items: center;
    justify-content: center;

    gap: 7px;

    padding:
        0 13px;

    border:
        1px solid
        rgba(255,255,255,.14);

    border-radius: 7px;

    color: #ffffff;

    background:
        rgba(255,255,255,.055);

    font-size: 12px;
    font-weight: 600;

    cursor: pointer;

    white-space: nowrap;
}

/* DETAILS */

.details {
    padding:
        24px 20px 20px;

    border-top:
        1px solid
        rgba(255,255,255,.08);

    background:
        rgba(0,0,0,.15);
}

.detailsMeta {
    display: grid;

    grid-template-columns:
        repeat(4,minmax(0,1fr));

    gap: 18px;

    margin-bottom: 25px;
}

.metaBlock {
    padding: 14px;

    border-radius: 8px;

    background:
        rgba(255,255,255,.035);
}

.metaBlock span {
    display: block;

    margin-bottom: 7px;

    color:
        rgba(255,255,255,.45);

    font-size: 11px;
    font-weight: 700;

    text-transform: uppercase;
}

.metaBlock strong {
    display: block;

    overflow: hidden;

    color:
        rgba(255,255,255,.86);

    font-size: 13px;

    text-overflow: ellipsis;
}

.externalReferenceRow {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.externalReferenceRow strong {
    min-width: 0;
    flex: 1;
    white-space: nowrap;
}

.copyReferenceButton {
    min-height: 28px;
    flex-shrink: 0;
    padding: 0 10px;
    border: 1px solid rgba(160,144,255,.24);
    border-radius: 6px;
    color: #c5bdff;
    background: rgba(126,103,255,.12);
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
}

.copyReferenceButton:hover:not(:disabled) {
    border-color: rgba(174,160,255,.4);
    background: rgba(126,103,255,.22);
}

.itemsTitle {
    margin-bottom: 12px;

    color:
        rgba(255,255,255,.5);

    font-size: 12px;
    font-weight: 700;

    letter-spacing: 1px;
}

.itemsList {
    display: flex;
    flex-direction: column;

    gap: 10px;
}

.itemCard {
    display: grid;
  grid-template-columns: 1.4fr 0.7fr 1.4fr 1.2fr 0.8fr 1fr 0.7fr;
    gap: 15px;

    align-items: center;

    padding: 16px;

    border:
        1px solid
        rgba(255,255,255,.08);

    border-radius: 8px;

    background:
        rgba(255,255,255,.035);
}

.itemProduct {
    display: flex;
    align-items: center;

    gap: 11px;
}

.productLetter {
    width: 40px;
    height: 40px;

    display: flex;
    align-items: center;
    justify-content: center;

    flex-shrink: 0;

    border-radius: 7px;

    color: #afa3ff;

    background:
        rgba(128,103,255,.14);

    font-size: 14px;
    font-weight: 800;
}

.itemProduct strong {
    display: block;

    font-size: 13px;
}

.itemProduct span {
    display: block;

    margin-top: 4px;

    color:
        rgba(255,255,255,.4);

    font-size: 11px;
}

.itemInfo span {
    display: block;

    margin-bottom: 5px;

    color:
        rgba(255,255,255,.4);

    font-size: 10px;
    font-weight: 700;

    text-transform: uppercase;
}

.itemInfo strong {
    display: block;

    color:
        rgba(255,255,255,.82);

    font-size: 12px;
}

.publishedLink {
    color: #b3a8ff;

    font-size: 12px;
    font-weight: 700;

    text-decoration: none;
}

.noUrl {
    color:
        rgba(255,255,255,.34);

    font-size: 12px;
}


/* ITEM ADMIN CONTROLS */

.itemAdminControls {
    grid-column: 1 / -1;
    display: grid;
     grid-template-columns: 1fr 1fr 1.6fr 0.8fr;
    gap: 12px;

    align-items: end;

    margin-top: 4px;

    padding-top: 16px;

    border-top:
        1px solid
        rgba(255,255,255,.08);
}

.controlGroup {
    min-width: 0;
}

.controlGroup label {
    display: block;

    margin-bottom: 7px;

    color:
        rgba(255,255,255,.48);

    font-size: 10px;
    font-weight: 700;

    text-transform: uppercase;

    letter-spacing: .5px;
}

.controlGroup select,
.controlGroup input {
    width: 100%;
    min-width: 0;

    height: 44px;

    padding:
        0 12px;

    border:
        1px solid
        rgba(255,255,255,.13);

    border-radius: 7px;

    color: #ffffff;

    background: #1a113b;

    font-size: 12px;
    background-position: right 14px center;
    outline: none;
}

.controlGroup input::placeholder {
    color:
        rgba(255,255,255,.3);
}

.controlGroup input[type="date"] {
    color-scheme: dark;
}

.saveItemButton {
    height: 44px;

    padding:
        0 16px;

    border: 0;

    border-radius: 7px;

    color: #ffffff;

    background:
        linear-gradient(
            135deg,
            #765dff,
            #5b42ea
        );

    font-size: 12px;
    font-weight: 700;

    cursor: pointer;
}

.saveItemButton:disabled {
    opacity: .5;
    cursor: default;
}

.itemMessage {
    grid-column: 1 / -1;

    margin-top: -2px;

    padding:
        10px 12px;

    border-radius: 6px;

    color: #c9c1ff;

    background:
        rgba(122,97,255,.1);

    font-size: 11px;
    line-height: 1.45;
}

/* PAGINATION */

.pagination {
    width: 100%;

    display: flex;
    align-items: center;
    justify-content: space-between;

    gap: 16px;

    margin-top: 22px;

    padding-top: 20px;

    border-top:
        1px solid
        rgba(255,255,255,.08);
}

.paginationButton {
    min-height: 42px;

    padding:
        0 16px;

    border:
        1px solid
        rgba(255,255,255,.13);

    border-radius: 7px;

    color: #ffffff;

    background:
        rgba(255,255,255,.05);

    font-size: 12px;
    font-weight: 700;

    cursor: pointer;

    transition:
        background .2s ease,
        border-color .2s ease,
        opacity .2s ease;
}

.paginationButton:hover:not(:disabled) {
    background:
        rgba(118,93,255,.16);

    border-color:
        rgba(157,142,255,.35);
}

.paginationButton:disabled {
    opacity: .35;
    cursor: default;
}

.paginationInfo {
    display: flex;
    align-items: center;

    gap: 7px;

    color:
        rgba(255,255,255,.5);

    font-size: 12px;
}

.paginationInfo strong {
    color: #ffffff;

    font-size: 13px;
}


/* NON-BLOCKING SYNC WARNING */

.syncWarningBox {
    display: flex;
    align-items: center;
    justify-content: space-between;

    gap: 20px;

    margin-bottom: 20px;

    padding: 16px 18px;

    border:
        1px solid
        rgba(255,196,82,.24);

    border-radius: 8px;

    background:
        rgba(255,196,82,.08);
}

.syncWarningBox strong,
.syncWarningBox span {
    display: block;
}

.syncWarningBox strong {
    color: #ffd36e;
    font-size: 13px;
}

.syncWarningBox span {
    margin-top: 5px;

    color:
        rgba(255,255,255,.68);

    font-size: 12px;
    line-height: 1.5;
}

.syncWarningBox button {
    min-height: 40px;

    flex-shrink: 0;

    padding:
        0 15px;

    border:
        1px solid
        rgba(255,211,110,.22);

    border-radius: 6px;

    color: #ffffff;

    background:
        rgba(255,211,110,.1);

    font-size: 11px;
    font-weight: 700;

    cursor: pointer;
}

/* ERROR */

.errorBox {
    display: flex;
    align-items: center;
    justify-content: space-between;

    gap: 20px;

    margin-bottom: 20px;

    padding: 18px;

    border:
        1px solid
        rgba(255,83,111,.24);

    border-radius: 8px;

    background:
        rgba(255,83,111,.09);
}

.errorBox strong,
.errorBox span {
    display: block;
}

.errorBox strong {
    font-size: 14px;
}

.errorBox span {
    margin-top: 5px;

    color: #ffc2cc;

    font-size: 13px;
}

.errorBox button {
    min-height: 40px;

    padding:
        0 15px;

    border: 0;

    border-radius: 6px;

    cursor: pointer;
}

/* EMPTY */

.emptyState {
    padding:
        70px 20px;

    text-align: center;
}

.emptyState strong,
.emptyState span {
    display: block;
}

.emptyState strong {
    font-size: 18px;
}

.emptyState span {
    margin-top: 8px;

    color:
        rgba(255,255,255,.48);

    font-size: 14px;
}

/* LOADING */

.adminLoading {
    width: 100%;
    min-height: 520px;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    gap: 15px;

    color: #ffffff;

    background: transparent;

    font-family:
        Arial,
        sans-serif;

    font-size: 14px;
}

.loader {
    width: 42px;
    height: 42px;

    border:
        3px solid
        rgba(255,255,255,.12);

    border-top-color:
        #8069ff;

    border-radius: 50%;

    animation:
        spin .8s linear infinite;
}

.authRetryButton {
    min-height: 42px;
    padding: 0 18px;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 8px;
    color: #ffffff;
    background: rgba(255,255,255,.06);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}

/* =========================================================
   1280px
========================================================= */

/* =========================================================
   MID DESKTOP: 1024px — 1399px
========================================================= */

@media (min-width: 1024px) and (max-width: 1399px) {

    .adminPage {
        padding:
            36px 18px 60px;
    }

    .adminContainer {
        width: 100%;
        max-width: none;
    }


    /* HEADER */

    .adminHeader {
        gap: 24px;
        margin-bottom: 26px;
    }

    .adminHeader h1 {
        font-size: 36px;
    }

    .adminHeader p {
        font-size: 14px;
    }

    .adminIdentity {
        font-size: 12px;
    }

    .refreshButton,
    .logoutButton {
        min-height: 40px;

        padding:
            0 14px;

        font-size: 11px;
    }


    /* SUMMARY CARDS */

    .summaryGrid {
        grid-template-columns:
            repeat(3, minmax(0, 1fr));

        gap: 10px;

        margin-bottom: 12px;
    }

    .summaryCard {
        min-height: 104px;

        gap: 10px;

        padding: 14px;
    }

    .summaryIcon {
        width: 38px;
        height: 38px;

        font-size: 15px;
    }

    .summaryCard span {
        margin-bottom: 6px;

        font-size: 9px;

        letter-spacing: 0.4px;
    }

    .summaryCard strong {
        font-size: 19px;
    }


    /* SOURCE CARDS */

    .sourceGrid {
        gap: 10px;

        margin-bottom: 18px;
    }

    .sourceCard {
        min-height: 78px;

        padding:
            15px 16px;
    }

    .sourceCard span {
        font-size: 11px;
    }

    .sourceCard strong {
        font-size: 21px;
    }

    .sourceLogo {
        width: 36px;
        height: 36px;

        font-size: 14px;
    }


    /* ORDERS PANEL */

    .ordersPanel {
        padding: 18px;

        border-radius: 12px;
    }

    .ordersTop {
        margin-bottom: 18px;
    }

    .sectionLabel {
        font-size: 10px;
    }

    .ordersTop h2 {
        margin-top: 5px;

        font-size: 25px;
    }

    .resultsCount {
        font-size: 11px;
    }


    /* FILTER BAR */

    .filters {
        grid-template-columns:
            minmax(250px, 1fr)
            145px
            145px
            145px;

        gap: 8px;

        margin-bottom: 18px;
    }

    .searchBox {
        min-height: 46px;

        padding:
            0 12px;
    }

    .searchBox input {
        font-size: 12px;
    }

    .filters select {
        min-height: 46px;

        padding:
            0 38px 0 12px;

        background-position:
            right 12px center;

        font-size: 12px;
    }


    /* RESTORE DESKTOP TABLE */

    .tableHeader {
        display: grid;
    }

    .orderRow > :nth-child(4),
    .orderRow > :nth-child(5) {
        display: block;
    }


    /* TABLE GRID */

    .tableHeader,
    .orderRow {
        grid-template-columns:
            minmax(190px, 1.35fr)
            minmax(145px, 1fr)
            90px
            92px
            110px
            118px
            84px;

        gap: 10px;
    }

    .tableHeader {
        padding:
            0 12px 10px;

        font-size: 9px;

        letter-spacing: 0.5px;
    }

    .orderRow {
        min-height: 74px;

        padding:
            13px 12px;
    }


    /* ORDER CELL */

    .orderMainCell {
        gap: 9px;
    }

    .orderIcon {
        width: 38px;
        height: 38px;

        border-radius: 7px;

        font-size: 12px;
    }

    .orderText strong,
    .customerCell strong {
        font-size: 12px;
    }

    .orderText span,
    .customerEmail {
        margin-top: 4px;

        font-size: 10px;
    }

    .dateValue {
        font-size: 11px;
    }

    .amountValue {
        font-size: 12px;
    }


    /* SOURCE + STATUS */

    .sourceBadge {
        padding:
            6px 8px;

        font-size: 9px;
    }

    .statusBadge {
        gap: 5px;

        padding:
            6px 8px;

        font-size: 9px;
    }

    .statusBadge i {
        width: 5px;
        height: 5px;
    }


    /* VIEW BUTTON */

    .viewButton {
        min-height: 34px;

        gap: 4px;

        padding:
            0 8px;

        font-size: 10px;
    }


    /* EXPANDED DETAILS */

    .details {
        padding:
            20px 16px 16px;
    }

    .detailsMeta {
        gap: 12px;

        margin-bottom: 18px;
    }

    .metaBlock {
        padding: 11px;
    }

    .metaBlock span {
        font-size: 9px;
    }

    .metaBlock strong {
        font-size: 11px;
    }


    /* ORDER ITEMS */

    .itemCard {
        grid-template-columns: 1.4fr 1fr 1.2fr 1fr;
        gap: 9px;
        padding: 12px;
    }

    /* Restore hidden columns from old breakpoint rules */

    .itemCard > :nth-child(4),
    .itemCard > :nth-child(5) {
        display: block;
    }

    .productLetter {
        width: 34px;
        height: 34px;

        font-size: 12px;
    }

    .itemProduct strong {
        font-size: 11px;
    }

    .itemProduct span {
        font-size: 9px;
    }

    .itemInfo span {
        font-size: 8px;
    }

    .itemInfo strong {
        font-size: 10px;
    }

    .publishedLink,
    .noUrl {
        font-size: 10px;
    }
}

/* =========================================================
   TABLET
========================================================= */

/* =========================================================
   TABLET: 767px — 1023px
========================================================= */

@media (min-width: 767px) and (max-width: 1023px) {

    .adminShell {
        grid-template-columns: 220px minmax(0, 1fr);
        gap: 18px;
    }

    .adminSidebar {
        padding: 18px;
    }

    .releaseSummaryGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }

    .releaseTableHeader {
        display: none;
    }

    .releaseRow {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px 22px;
        padding: 20px;
    }

    .releaseMainCell {
        grid-column: 1 / -1;
        padding-bottom: 16px;
        border-bottom: 1px solid rgba(255,255,255,.08);
    }


    .itemAdminControls {
        grid-template-columns:
            1fr 1fr;

        gap: 10px;
    }

    .saveItemButton {
        grid-column: 1 / -1;
        width: 100%;
    }



    /* PAGE */
.tableHeader {
    display: none;
}
    .adminPage {
        width: 100%;
        padding:
            32px 20px 60px;

        overflow-x: hidden;
    }

    .adminContainer {
        width: 100%;
        max-width: 100%;
        min-width: 0;
    }


    /* HEADER */

    .adminHeader {
        display: flex;
        flex-direction: column;

        gap: 20px;

        margin-bottom: 26px;
    }

    .adminHeader h1 {
        font-size: 36px;
    }

    .adminHeader p {
        max-width: 560px;

        font-size: 14px;
    }

    .adminIdentity {
        font-size: 12px;
    }

    .headerButtons {
        width: 100%;

        display: grid;
        grid-template-columns:
            repeat(2, 1fr);

        gap: 10px;
    }

    .syncBadge {
        grid-column: 1 / -1;
        width: fit-content;
        min-height: 40px;
    }

    .refreshButton,
    .logoutButton {
        width: 100%;

        min-height: 44px;

        justify-content: center;
    }


    /* =========================================
       SUMMARY
    ========================================= */

    .summaryGrid {
        display: grid;

        grid-template-columns:
            repeat(2, minmax(0, 1fr));

        gap: 12px;

        margin-bottom: 14px;
    }

    .summaryCard {
        width: 100%;

        min-width: 0;
        min-height: 108px;

        padding: 18px;

        gap: 14px;
    }

    .summaryIcon {
        width: 42px;
        height: 42px;

        font-size: 15px;
    }

    .summaryCard span {
        font-size: 10px;

        line-height: 1.4;
    }

    .summaryCard strong {
        font-size: 25px;
    }


    /* =========================================
       SOURCE CARDS
    ========================================= */

    .sourceGrid {
        display: grid;

        grid-template-columns:
            repeat(2, minmax(0, 1fr));

        gap: 12px;

        margin-bottom: 20px;
    }

    .sourceCard {
        width: 100%;
        min-width: 0;

        min-height: 86px;

        padding:
            17px 18px;
    }

    .sourceCard span {
        font-size: 11px;
    }

    .sourceCard strong {
        font-size: 22px;
    }

    .sourceLogo {
        width: 38px;
        height: 38px;
    }


    /* =========================================
       ORDER PANEL
    ========================================= */

    .ordersPanel {
        width: 100%;

        padding: 20px;

        overflow: hidden;
    }

    .ordersTop {
        align-items: flex-end;

        margin-bottom: 18px;
    }

    .ordersTop h2 {
        font-size: 27px;
    }

    .sectionLabel {
        font-size: 10px;
    }

    .resultsCount {
        font-size: 11px;
    }


    /* =========================================
       FILTERS
    ========================================= */

    .filters {
        width: 100%;

        display: grid;

        grid-template-columns:
            repeat(2, minmax(0, 1fr));

        gap: 10px;

        margin-bottom: 20px;
    }

    .searchBox {
        grid-column:
            1 / -1;

        width: 100%;
        min-width: 0;

        min-height: 48px;
    }

    .searchBox input {
        width: 100%;
        min-width: 0;

        font-size: 13px;
    }

    .filters select {
        width: 100%;
        min-width: 0;

        min-height: 48px;

        padding:
            0 42px 0 14px;

        background-position:
            right 14px center;

        font-size: 13px;
    }


    /* =========================================
       REMOVE DESKTOP TABLE HEADER
    ========================================= */

    .tableHeader {
        display: none;
    }


    /* =========================================
       ORDER CARDS
    ========================================= */

    .orderList {
        gap: 12px;
    }

    .orderCard {
        width: 100%;
        min-width: 0;
    }

    .orderRow {
        width: 100%;

        display: grid;

        grid-template-columns:
            repeat(2, minmax(0, 1fr));

        gap:
            18px 22px;

        padding: 20px;

        min-height: auto;
    }

    /* Restore everything hidden by desktop queries */

    .orderRow > * {
        display: block !important;
        min-width: 0;
    }


    /* Order number full width */

    .orderMainCell {
        grid-column:
            1 / -1;

        display: flex !important;

        align-items: center;

        padding-bottom: 16px;

        border-bottom:
            1px solid
            rgba(255,255,255,.08);
    }

    .orderIcon {
        width: 42px;
        height: 42px;
    }

    .orderText strong {
        font-size: 13px;
    }

    .orderText span {
        font-size: 11px;
    }


    /* Customer */

    .customerCell {
        min-width: 0;
    }

    .customerCell strong {
        font-size: 13px;
    }

    .customerEmail {
        font-size: 11px;

        overflow: hidden;

        white-space: nowrap;
        text-overflow: ellipsis;
    }


    /* Mobile labels visible */

    .mobileLabel {
        display: block;

        margin-bottom: 7px;

        color:
            rgba(255,255,255,.42);

        font-size: 9px;
        font-weight: 700;

        letter-spacing: .6px;

        text-transform: uppercase;
    }


    /* Date and amount */

    .dateValue,
    .amountValue {
        font-size: 13px;
    }


    /* Badges */

    .sourceBadge,
    .statusBadge {
        font-size: 10px;
    }


    /* View button */

    .viewButton {
        grid-column:
            1 / -1;

        display: flex !important;

        width: 100%;

        min-height: 44px;

        font-size: 12px;
    }


    /* =========================================
       EXPANDED DETAILS
    ========================================= */

    .details {
        padding:
            20px;
    }

    .detailsMeta {
        display: grid;

        grid-template-columns:
            repeat(2, minmax(0, 1fr));

        gap: 12px;

        margin-bottom: 20px;
    }

    .metaBlock {
        min-width: 0;

        padding: 13px;
    }

    .metaBlock span {
        font-size: 9px;
    }

    .metaBlock strong {
        font-size: 11px;

        white-space: normal;
        word-break: break-word;
    }


    /* =========================================
       ORDER ITEMS
    ========================================= */

    .itemCard {
        width: 100%;

        display: grid;

        grid-template-columns:
            repeat(2, minmax(0, 1fr));

        gap:
            16px 20px;

        padding: 17px;
    }

    .itemCard > * {
        display: block !important;
        min-width: 0;
    }

    .itemProduct {
        grid-column:
            1 / -1;

        display: flex !important;

        padding-bottom: 13px;

        border-bottom:
            1px solid
            rgba(255,255,255,.07);
    }

    .productLetter {
        width: 38px;
        height: 38px;
    }

    .itemProduct strong {
        font-size: 12px;
    }

    .itemProduct span {
        font-size: 10px;
    }

    .itemInfo span {
        font-size: 9px;
    }

    .itemInfo strong {
        font-size: 11px;
    }

    .publishedLink,
    .noUrl {
        font-size: 11px;
    }
}

/* =========================================================
   MOBILE
========================================================= */

/* =========================================================
   MOBILE: 0px — 766px
========================================================= */

@media (max-width: 766px) {
.itemAdminControls .controlGroup {
    padding-top: 15px;
}

.itemAdminControls button.saveItemButton {
    margin-top: 15px;
}
    .unsavedModal {
        padding: 20px 16px;
    }

    .unsavedModalActions {
        grid-template-columns: 1fr;
    }

    .adminShell {
        display: block;
    }

    .adminSidebar {
        position: relative;
        top: auto;
        min-height: auto;
        margin-bottom: 20px;
        padding: 16px;
    }

    .releaseSummaryGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 18px;
    }

    .releaseFilters {
        grid-template-columns: 1fr;
        gap: 9px;
    }

    .releaseFilters select {
        width: 100%;
        min-width: 0;
    }

    .releaseTableHeader {
        display: none !important;
    }

    .releaseRow {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 15px;
        min-height: auto;
        padding: 16px;
    }

    .releaseRow > * {
        display: block !important;
        width: 100%;
        min-width: 0;
    }

    .releaseMainCell {
        display: flex !important;
        padding-bottom: 14px;
        border-bottom: 1px solid rgba(255,255,255,.08);
    }


    .itemAdminControls {
        grid-template-columns:
            1fr;

        gap: 10px;
    }

    .saveItemButton,
    .itemMessage {
        grid-column: auto;
        width: 100%;
    }



    /* =====================================================
       PAGE
    ===================================================== */

    .adminPage {
        width: 100%;
        min-width: 0;

        padding:
            24px 14px 50px;

        overflow-x: hidden;
    }

    .adminContainer {
        width: 100%;
        max-width: 100%;
        min-width: 0;

        overflow: hidden;
    }


    /* =====================================================
       HEADER
    ===================================================== */

    .adminHeader {
        width: 100%;

        display: flex;
        flex-direction: column;

        gap: 18px;

        margin-bottom: 24px;
    }

    .adminHeader > div:first-child {
        width: 100%;
        min-width: 0;
    }

    .eyebrow {
        font-size: 10px;

        letter-spacing: 1.2px;

        margin-bottom: 12px;
    }

    .adminHeader h1 {
        max-width: 100%;

        margin: 0;

        font-size: 34px;
        line-height: 1.08;

        letter-spacing: -1px;

        word-break: normal;
    }

    .adminHeader p {
        max-width: 100%;

        margin-top: 12px;

        font-size: 14px;
        line-height: 1.55;
    }

    .adminIdentity {
        font-size: 11px;
        line-height: 1.5;
    }


    /* HEADER BUTTONS */

    .headerButtons {
        width: 100%;

        display: grid;

        grid-template-columns:
            repeat(2, minmax(0, 1fr));

        gap: 8px;
    }

    .syncBadge {
        grid-column: 1 / -1;
        width: fit-content;
        min-height: 38px;
        padding: 0 11px;
        font-size: 10px;
    }

    .newOrderToast {
        left: 14px;
        right: 14px;
        bottom: 14px;
        top: auto;

        width: auto;

        grid-template-columns: 40px minmax(0, 1fr);

        padding: 14px 42px 14px 14px;
    }

    .toastIcon {
        width: 40px;
        height: 40px;
    }

    .refreshButton,
    .logoutButton {
        width: 100%;
        min-width: 0;
        min-height: 42px;

        padding:
            0 10px;

        justify-content: center;

        font-size: 11px;
    }


    /* =====================================================
       SUMMARY CARDS
    ===================================================== */

    .summaryGrid {
        width: 100%;

        display: grid !important;

        grid-template-columns:
            repeat(2, minmax(0, 1fr)) !important;

        gap: 10px;

        margin-bottom: 12px;
    }

    .summaryCard {
        width: 100%;
        min-width: 0;
        min-height: 104px;

        display: flex;

        gap: 10px;

        padding: 14px 12px;
    }

    .summaryIcon {
        width: 36px;
        height: 36px;

        flex-shrink: 0;

        font-size: 13px;
    }

    .summaryCard span {
        margin-bottom: 5px;

        font-size: 9px;
        line-height: 1.25;

        letter-spacing: 0.3px;
    }

    .summaryCard strong {
        font-size: 21px;
        line-height: 1.1;
    }


    /* =====================================================
       SOURCE CARDS
    ===================================================== */

    .sourceGrid {
        width: 100%;

        display: grid;

        grid-template-columns:
            repeat(2, minmax(0, 1fr));

        gap: 10px;

        margin-bottom: 18px;
    }

    .sourceCard {
        width: 100%;
        min-width: 0;

        min-height: 86px;

        padding:
            14px;
    }

    .sourceCard span {
        font-size: 10px;
        line-height: 1.3;
    }

    .sourceCard strong {
        font-size: 20px;
    }

    .sourceLogo {
        width: 34px;
        height: 34px;

        flex-shrink: 0;

        font-size: 13px;
    }


    /* =====================================================
       ORDERS PANEL
    ===================================================== */

    .ordersPanel {
        width: 100%;
        min-width: 0;

        padding: 14px;

        border-radius: 12px;

        overflow: hidden;
    }

    .ordersTop {
        width: 100%;

        display: flex;
        align-items: flex-end;
        justify-content: space-between;

        gap: 12px;

        margin-bottom: 18px;
    }

    .sectionLabel {
        font-size: 9px;

        letter-spacing: 1px;
    }

    .ordersTop h2 {
        margin-top: 5px;

        font-size: 24px;
    }

    .resultsCount {
        flex-shrink: 0;

        font-size: 10px;
    }


    /* =====================================================
       FILTERS
    ===================================================== */

    .filters {
        width: 100%;

        display: grid !important;

        grid-template-columns:
            1fr !important;

        gap: 9px;

        margin-bottom: 18px;
    }

    .searchBox {
        width: 100%;
        min-width: 0;

        grid-column: auto !important;

        min-height: 46px;

        padding:
            0 12px;
    }

    .searchBox input {
        width: 100%;
        min-width: 0;

        font-size: 12px;
    }

    .filters select {
        width: 100%;
        min-width: 0;

        min-height: 46px;

        padding:
            0 44px 0 13px;

        background-position:
            right 14px center;

        font-size: 12px;
    }


    /* =====================================================
       HIDE DESKTOP TABLE HEADER
    ===================================================== */

    .tableHeader {
        display: none !important;
    }


    /* =====================================================
       ORDER LIST
    ===================================================== */

    .orderList {
        width: 100%;

        gap: 10px;
    }

    .orderCard {
        width: 100%;
        min-width: 0;

        overflow: hidden;
    }

    .orderRow {
        width: 100%;
        min-width: 0;

        display: grid !important;

        grid-template-columns:
            1fr !important;

        gap: 15px;

        min-height: auto;

        padding: 16px;
    }

    /* IMPORTANT:
       Restore all hidden columns from desktop and tablet CSS
    */

    .orderRow > * {
        display: block !important;

        width: 100%;
        min-width: 0;
    }


    /* ORDER MAIN */

    .orderMainCell {
        width: 100%;

        display: flex !important;
        align-items: center;

        grid-column: auto !important;

        gap: 11px;

        padding-bottom: 14px;

        border-bottom:
            1px solid
            rgba(255,255,255,.08);
    }

    .orderIcon {
        width: 40px;
        height: 40px;

        flex-shrink: 0;

        font-size: 12px;
    }

    .orderText {
        width: calc(100% - 51px);
        min-width: 0;
    }

    .orderText strong {
        display: block;

        width: 100%;

        font-size: 12px;

        overflow: hidden;

        white-space: nowrap;

        text-overflow: ellipsis;
    }

    .orderText span {
        margin-top: 5px;

        font-size: 10px;
    }


    /* CUSTOMER + OTHER INFO */

    .customerCell,
    .responsiveCell {
        width: 100%;
        min-width: 0;

        padding-top: 2px;
    }

    .customerCell strong {
        font-size: 13px;
    }

    .customerEmail {
        width: 100%;

        font-size: 11px;

        overflow: hidden;

        white-space: nowrap;

        text-overflow: ellipsis;
    }

    .mobileLabel {
        display: block !important;

        margin-bottom: 6px;

        color:
            rgba(255,255,255,.42);

        font-size: 9px;
        font-weight: 700;

        letter-spacing: .6px;

        text-transform: uppercase;
    }

    .dateValue,
    .amountValue {
        font-size: 13px;
    }


    /* BADGES */

    .sourceBadge,
    .statusBadge {
        font-size: 10px;
    }

    .sourceBadge {
        padding:
            7px 10px;
    }

    .statusBadge {
        padding:
            7px 10px;

        gap: 6px;
    }


    /* VIEW BUTTON */

    .viewButton {
        display: flex !important;

        width: 100%;

        grid-column: auto !important;

        min-height: 44px;

        justify-content: center;

        font-size: 12px;
    }


    /* =====================================================
       EXPANDED DETAILS
    ===================================================== */

    .details {
        width: 100%;

        padding:
            18px 14px;
    }

    .detailsMeta {
        width: 100%;

        display: grid;

        grid-template-columns:
            1fr;

        gap: 10px;

        margin-bottom: 18px;
    }

    .metaBlock {
        width: 100%;
        min-width: 0;

        padding: 12px;
    }

    .metaBlock span {
        font-size: 9px;
    }

    .metaBlock strong {
        font-size: 11px;

        white-space: normal;
        word-break: break-word;
    }


    /* =====================================================
       ORDER ITEMS
    ===================================================== */

    .itemsTitle {
        font-size: 10px;
    }

    .itemCard {
        width: 100%;

        display: grid !important;

        grid-template-columns:
            1fr !important;

        gap: 14px;

        padding: 15px;
    }

    .itemCard > * {
        display: block !important;

        width: 100%;
        min-width: 0;
    }

    .itemProduct {
        display: flex !important;

        width: 100%;

        grid-column: auto !important;

        padding-bottom: 12px;

        border-bottom:
            1px solid
            rgba(255,255,255,.07);
    }

    .productLetter {
        width: 36px;
        height: 36px;

        flex-shrink: 0;

        font-size: 12px;
    }

    .itemProduct strong {
        font-size: 12px;
    }

    .itemProduct span {
        font-size: 10px;
    }

    .itemInfo {
        padding-top: 2px;
    }

    .itemInfo span {
        font-size: 9px;
    }

    .itemInfo strong {
        font-size: 11px;
    }

    .publishedLink,
    .noUrl {
        font-size: 11px;
    }


    /* =====================================================
       PAGINATION
    ===================================================== */

    .pagination {
        gap: 8px;
    }

    .paginationButton {
        min-height: 40px;

        padding:
            0 10px;

        font-size: 10px;
    }

    .paginationInfo {
        gap: 4px;

        font-size: 10px;
    }

    .paginationInfo strong {
        font-size: 11px;
    }


    /* =====================================================
       ERROR
    ===================================================== */

    .errorBox,
    .syncWarningBox {
        flex-direction: column;
        align-items: stretch;

        gap: 14px;
    }

    .errorBox button,
    .syncWarningBox button {
        width: 100%;
    }
}

@media (min-width: 767px) and (max-width: 1023px) {
    .releaseDetailsGridAdmin,
    .releaseContentGridAdmin,
    .releasePrimaryContentGrid {
        grid-template-columns: 1fr;
    }

    .releaseAdminControls {
        grid-template-columns: 1fr 1fr;
    }

    .releaseAdminControls .urlControl,
    .releaseAdminControls .fullControl,
    .releaseSaveButton,
    .releaseMessage {
        grid-column: 1 / -1;
    }
}

@media (max-width: 766px) {
    .releaseDetailsAdmin {
        padding: 18px 14px;
    }

    .releaseDetailsGridAdmin,
    .releaseDetailsInfoGridAdmin,
    .releaseContentGridAdmin,
    .releasePrimaryContentGrid,
    .releaseAdminControls {
        grid-template-columns: 1fr;
    }

    .sourceDocumentCard {
        align-items: stretch;
        flex-direction: column;
    }

    .sourceDocumentDownloadButton {
        width: 100%;
    }

    .releaseAdminControls .urlControl,
    .releaseAdminControls .fullControl,
    .releaseSaveButton,
    .releaseMessage {
        grid-column: auto;
        width: 100%;
    }
}
@media (min-width: 1500px) and (max-width: 1699px) {
.statusBadge {
    font-size: 10px!important;
}
    }
    /* =========================================================


@media (min-width: 1299px) and (max-width: 1499px) {
    .tableHeader,
    .orderRow {
        grid-template-columns:
            minmax(170px, 1.3fr)
            minmax(150px, 1fr)
            90px
            80px
            115px
            110px
            95px;
        gap: 12px;
    }

    .orderText strong,
    .customerCell strong {
        font-size: 12px;
    }


    .sourceBadge,
    .statusBadge {
        font-size: 9px;
        padding: 6px 8px;
    }


    .viewButton {
        min-height: 34px;
        padding: 0 8px;
        font-size: 10px;
    }

 

}
/* =========================================================
   ORDER CARD STYLE 1024px - 1270px
========================================================= */

@media (min-width:1024px) and (max-width:1298px) {

    .tableHeader {
        display:none;
    }


    .orderRow {

        display:grid !important;

        grid-template-columns:
            repeat(5, minmax(0,1fr));

        gap:
            18px 22px;

        min-height:auto;

        padding:20px;
    }


    .orderRow > * {
        display:block !important;
        min-width:0;
    }


    .orderMainCell {

        grid-column:
            1 / -1;

        display:flex !important;

        padding-bottom:16px;

        border-bottom:
        1px solid rgba(255,255,255,.08);
    }


    .viewButton {

        width:100%;

        min-height:44px;
    }


    .orderActionCell {

        grid-column:
            1 / -1;
    }


    .mobileLabel {
        display:block !important;
    }


    .orderIcon {
        width:42px;
        height:42px;

    }


    .orderText strong,
    .customerCell strong {

        font-size:13px;

    }


    .dateValue,
    .amountValue {

        font-size:13px;

    }
    .mobileLabel {
        display: block;
        margin-bottom: 7px;
        color: rgba(255, 255, 255, .42);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: .6px;
        text-transform: uppercase;
    }
     .releaseTableHeader {
        display:none;
    }


    .releaseRow {
        display:grid !important;
        grid-template-columns: 1.4fr 1.4fr 1fr 1.4fr 1fr;
        gap:18px 22px;
        min-height:auto;
        padding:20px;
    }


    /* Main release info full width */

    .releaseMainCell {

        grid-column:
            1 / -1;

        display:flex !important;

        padding-bottom:16px;

        border-bottom:
        1px solid rgba(255,255,255,.08);
    }


    /* If view/action button exists */


    .releaseRow .mobileLabel {

        display:block !important;

    }


    .releaseMainCell strong {

        font-size:13px;

    }
}

@media (min-width: 1299px) and (max-width: 1699px) {
section.summaryGrid .summaryCard {
    min-height: 95px;
    display: flex;
    align-items: flex-start;
    flex-direction: column;
    }
}
@media (min-width: 767px) and (max-width: 1024px) {
    .adminPage {
        overflow-x: clip;
    }

    .adminSidebar {
        position: sticky;
        top: 20px;
        z-index: 2;
        align-self: start;
        height: 100vh;
        min-height: 0;
        max-height: 100vh;
        overflow-x: hidden;
        overflow-y: auto;
    }
}
.itemAdminControls .controlGroup select {
    appearance: none;
    -webkit-appearance: none;

    padding: 0 44px 0 12px;

    background-color: #1a113b;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 16px center;
    background-size: 14px 14px;
}
`
