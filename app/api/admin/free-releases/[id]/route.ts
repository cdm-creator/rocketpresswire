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

type RouteContext = {
    params: Promise<{ id?: string }>
}

type AllowedField = "status" | "admin_status" | "published_url" | "report_file"
type RequestBody = Partial<Record<AllowedField, unknown>> & Record<string, unknown>

const allowedFields: AllowedField[] = [
    "status",
    "admin_status",
    "published_url",
    "report_file",
]

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, { status, headers: ADMIN_CORS_HEADERS })
}

function buildUpdate(body: RequestBody) {
    if (Object.keys(body).some((field) => !allowedFields.includes(field as AllowedField))) {
        return null
    }

    const update: Record<string, string | null> = {}

    for (const field of allowedFields) {
        if (!Object.hasOwn(body, field)) continue

        const value = body[field]

        if (value !== null && typeof value !== "string") return null

        update[field] = typeof value === "string" ? value.trim() || null : null
    }

    if (Object.keys(update).length === 0) return null

    update.updated_at = new Date().toISOString()
    return update
}

export async function OPTIONS() {
    return adminOptionsResponse()
}

export async function PATCH(request: Request, context: RouteContext) {
    try {
        const activeAdmin = await requireActiveAdmin(request)
        const { id } = await context.params

        if (!id) {
            return jsonResponse({ error: "Missing release ID" }, 400)
        }

        let body: RequestBody

        try {
            body = (await request.json()) as RequestBody
        } catch {
            return jsonResponse({ error: "Invalid body" }, 400)
        }

        const update = buildUpdate(body)

        if (!update) {
            return jsonResponse({ error: "Invalid body" }, 400)
        }

        const { data, error } = await supabaseAdmin
            .from("free_releases")
            .update(update)
            .eq("id", id)
            .select("*")
            .maybeSingle()

        if (error) {
            console.error("[admin-free-release-update] Failed to update release", {
                adminEmail: activeAdmin.email,
                releaseId: id,
                error: error.message,
            })
            return jsonResponse({ error: "Server error" }, 500)
        }

        if (!data) {
            return jsonResponse({ error: "Release not found" }, 404)
        }

        return jsonResponse({ success: true, release: data }, 200)
    } catch (error) {
        if (error instanceof AdminAuthorizationError) {
            return jsonResponse({ error: error.message }, error.status)
        }

        console.error("[admin-free-release-update] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })
        return jsonResponse({ error: "Server error" }, 500)
    }
}
