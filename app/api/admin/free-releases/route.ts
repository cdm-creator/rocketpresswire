import {
    ADMIN_CORS_HEADERS,
    adminOptionsResponse,
} from "@/lib/admin-auth"
import {
    AdminAuthorizationError,
    requireActiveAdmin,
} from "@/lib/requireActiveAdmin"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 12
const MAX_LIMIT = 50
const MAX_SEARCH_LENGTH = 100
const LIST_FIELDS =
    "release_id,title,user_email,status,admin_status,created_at,published_url"

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, { status, headers: ADMIN_CORS_HEADERS })
}

function parsePositiveInteger(value: string | null, fallback: number) {
    if (value === null) return fallback
    if (!/^\d+$/.test(value)) return null

    const parsedValue = Number(value)
    return parsedValue > 0 ? parsedValue : null
}

function sanitizeSearch(value: string | null) {
    return (value ?? "")
        .trim()
        .slice(0, MAX_SEARCH_LENGTH)
        .replace(/[%,()]/g, " ")
        .trim()
}

function normalizeStatus(value: string | null | undefined) {
    return (value || "").trim().toLowerCase()
}

function applyListFilters(query: any, search: string, status: string) {
    let filteredQuery = query

    if (search) {
        filteredQuery = filteredQuery.or(
            [
                `release_id.ilike.%${search}%`,
                `title.ilike.%${search}%`,
                `user_email.ilike.%${search}%`,
                `customer_name.ilike.%${search}%`,
                `customer_email.ilike.%${search}%`,
                `contact_name.ilike.%${search}%`,
                `contact_email.ilike.%${search}%`,
            ].join(",")
        )
    }

    if (status === "published") {
        return filteredQuery.ilike("status", "published")
    }

    if (status === "completed") {
        return filteredQuery.or(
            "status.ilike.completed,admin_status.ilike.completed"
        )
    }

    if (status === "processing") {
        return filteredQuery.or(
            [
                "status.ilike.processing",
                "status.ilike.in_review",
                "status.ilike.current",
                "admin_status.ilike.processing",
                "admin_status.ilike.current",
                "admin_status.ilike.in_review",
                "admin_status.ilike.published",
            ].join(",")
        )
    }

    if (status === "pending") {
        return filteredQuery.or(
            [
                "admin_status.is.null",
                "and(admin_status.not.ilike.processing,admin_status.not.ilike.current,admin_status.not.ilike.in_review,admin_status.not.ilike.published,admin_status.not.ilike.completed)",
            ].join(",")
        )
    }

    if (status === "submitted") {
        return filteredQuery.or(
            [
                "status.is.null",
                "and(status.not.ilike.processing,status.not.ilike.in_review,status.not.ilike.current,status.not.ilike.published,status.not.ilike.completed)",
            ].join(",")
        )
    }

    return filteredQuery
}

export async function OPTIONS() {
    return adminOptionsResponse()
}

export async function GET(request: Request) {
    try {
        const activeAdmin = await requireActiveAdmin(request)
        const searchParams = new URL(request.url).searchParams
        const page = parsePositiveInteger(searchParams.get("page"), DEFAULT_PAGE)
        const limit = parsePositiveInteger(
            searchParams.get("limit"),
            DEFAULT_LIMIT
        )
        const search = sanitizeSearch(searchParams.get("search"))
        const status = normalizeStatus(searchParams.get("status") || "all")

        if (
            page === null ||
            limit === null ||
            limit > MAX_LIMIT ||
            ![
                "all",
                "submitted",
                "pending",
                "processing",
                "published",
                "completed",
            ].includes(status)
        ) {
            return jsonResponse({ error: "Invalid query parameters" }, 400)
        }

        const from = (page - 1) * limit
        const to = from + limit - 1
        const listQuery = applyListFilters(
            supabaseAdmin
                .from("free_releases")
                .select(LIST_FIELDS, { count: "exact" }),
            search,
            status
        )
        const summaryCountQuery = (summaryStatus = "all") =>
            applyListFilters(
                supabaseAdmin
                    .from("free_releases")
                    .select("release_id", { count: "exact", head: true }),
                "",
                summaryStatus
            )

        const [
            { data, count, error },
            { count: summaryTotal, error: summaryTotalError },
            { count: pending, error: pendingError },
            { count: processing, error: processingError },
            { count: completed, error: completedError },
        ] = await Promise.all([
            listQuery.order("created_at", { ascending: false }).range(from, to),
            summaryCountQuery(),
            summaryCountQuery("pending"),
            summaryCountQuery("processing"),
            summaryCountQuery("completed"),
        ])

        const summaryError =
            summaryTotalError || pendingError || processingError || completedError

        if (error || summaryError) {
            console.error("[admin-free-releases] Failed to query releases", {
                adminEmail: activeAdmin.email,
                error: error?.message || summaryError?.message,
            })
            return jsonResponse({ error: "Server error" }, 500)
        }

        const total = count ?? 0
        const totalPages = Math.max(1, Math.ceil(total / limit))

        return jsonResponse(
            {
                releases: data ?? [],
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1,
                },
                summary: {
                    total: summaryTotal ?? 0,
                    pending: pending ?? 0,
                    processing: processing ?? 0,
                    completed: completed ?? 0,
                },
            },
            200
        )
    } catch (error) {
        if (error instanceof AdminAuthorizationError) {
            return jsonResponse({ error: error.message }, error.status)
        }

        console.error("[admin-free-releases] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })
        return jsonResponse({ error: "Server error" }, 500)
    }
}
