import {
    ADMIN_CORS_HEADERS,
    adminOptionsResponse,
} from "@/lib/admin-auth"
import { normalizeToBusinessDate } from "@/lib/businessDate"
import {
    AdminAuthorizationError,
    requireActiveAdmin,
} from "@/lib/requireActiveAdmin"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 12
const MAX_LIMIT = 100_000
const AUTH_PAGE_SIZE = 1000
const MAX_AUTH_PAGES = 100

type AdminEmailRow = {
    email: string | null
}

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, { status, headers: ADMIN_CORS_HEADERS })
}

function parsePositiveInteger(value: string | null, fallback: number) {
    if (value === null) return fallback
    if (!/^\d+$/.test(value)) return null

    const parsedValue = Number(value)
    return Number.isSafeInteger(parsedValue) && parsedValue > 0
        ? parsedValue
        : null
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
        const selectedDate = searchParams.get("date")?.trim() || ""

        if (
            page === null ||
            limit === null ||
            limit > MAX_LIMIT ||
            (selectedDate &&
                normalizeToBusinessDate(selectedDate) !== selectedDate)
        ) {
            return jsonResponse({ error: "Invalid query parameters" }, 400)
        }

        const { data: adminRows, error: adminRowsError } = await supabaseAdmin
            .from("admin_users")
            .select("email")
            .returns<AdminEmailRow[]>()

        if (adminRowsError) {
            console.error("[admin-user-activity] Failed to query admin_users", {
                adminEmail: activeAdmin.email,
                error: adminRowsError.message,
            })
            return jsonResponse({ error: "Server error" }, 500)
        }

        const adminEmails = new Set(
            (adminRows ?? [])
                .map((admin) => admin.email?.trim().toLowerCase())
                .filter((email): email is string => Boolean(email))
        )
        const offset = (page - 1) * limit
        const activity: Array<{
            email: string | null
            created_at: string
            last_sign_in_at: string | null
        }> = []
        let matchingUsers = 0
        let authPage = 1
        let expectedAuthPages: number | null = null

        while (authPage <= MAX_AUTH_PAGES) {
            const { data, error } = await supabaseAdmin.auth.admin.listUsers({
                page: authPage,
                perPage: AUTH_PAGE_SIZE,
            })

            if (error) {
                console.error(
                    "[admin-user-activity] Failed to list auth users",
                    {
                        adminEmail: activeAdmin.email,
                        page: authPage,
                        error: error.message,
                    }
                )
                return jsonResponse({ error: "Server error" }, 500)
            }

            if (expectedAuthPages === null) {
                expectedAuthPages = Math.max(
                    1,
                    Math.ceil((data.total || data.users.length) / AUTH_PAGE_SIZE)
                )

                if (expectedAuthPages > MAX_AUTH_PAGES) {
                    console.error(
                        "[admin-user-activity] Auth user scan limit exceeded",
                        {
                            adminEmail: activeAdmin.email,
                            totalAuthUsers: data.total,
                            maxPages: MAX_AUTH_PAGES,
                        }
                    )
                    return jsonResponse(
                        { error: "Unable to load user activity" },
                        503
                    )
                }
            }

            for (const user of data.users) {
                const normalizedEmail = user.email?.trim().toLowerCase() || ""

                if (normalizedEmail && adminEmails.has(normalizedEmail)) {
                    continue
                }

                if (
                    selectedDate &&
                    normalizeToBusinessDate(user.created_at) !== selectedDate
                ) {
                    continue
                }

                if (
                    matchingUsers >= offset &&
                    activity.length < limit
                ) {
                    activity.push({
                        email: user.email ?? null,
                        created_at: user.created_at,
                        last_sign_in_at: user.last_sign_in_at ?? null,
                    })
                }

                matchingUsers += 1
            }

            if (
                data.users.length < AUTH_PAGE_SIZE ||
                authPage >= (expectedAuthPages ?? authPage)
            ) {
                break
            }

            authPage += 1
        }

        const totalPages = Math.max(1, Math.ceil(matchingUsers / limit))

        return jsonResponse(
            {
                users: activity,
                pagination: {
                    page,
                    limit,
                    total: matchingUsers,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1,
                },
            },
            200
        )
    } catch (error) {
        if (error instanceof AdminAuthorizationError) {
            return jsonResponse({ error: error.message }, error.status)
        }

        console.error("[admin-user-activity] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })
        return jsonResponse({ error: "Server error" }, 500)
    }
}
