import { supabaseAdmin } from "@/lib/supabase-admin"
import {
    ADMIN_CORS_HEADERS,
    adminOptionsResponse,
    requireVerifiedAdmin,
} from "@/lib/admin-auth"
import { sanitizePressReleaseHtml } from "@/lib/sanitizePressReleaseHtml"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = ADMIN_CORS_HEADERS

type RouteContext = {
    params: Promise<{
        id?: string
    }>
}

type RequestBody = {
    status?: unknown
    admin_status?: unknown
    published_url?: unknown
    live_article_links?: unknown
    report_title?: unknown
    report_excel_url?: unknown
    report_pdf_url?: unknown
    admin_notes?: unknown
    content?: unknown
}

type ReleaseUpdate = {
    status?: string | null
    admin_status?: string | null
    published_url?: string | null
    live_article_links?: string[] | null
    report_title?: string | null
    report_excel_url?: string | null
    report_pdf_url?: string | null
    admin_notes?: string | null
    content?: string
    updated_at: string
}

type StringUpdateField = Exclude<
    keyof ReleaseUpdate,
    "content" | "live_article_links" | "updated_at"
>

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, {
        status,
        headers: corsHeaders,
    })
}

function badRequestResponse(error: string) {
    return jsonResponse({ error }, 400)
}

function notFoundResponse() {
    return jsonResponse({ error: "Release not found" }, 404)
}

function serverErrorResponse() {
    return jsonResponse({ error: "Server error" }, 500)
}

function optionalString(value: unknown) {
    if (value === null) {
        return null
    }

    if (typeof value !== "string") {
        return undefined
    }

    const trimmedValue = value.trim()

    return trimmedValue === "" ? null : trimmedValue
}

function optionalStringArray(value: unknown) {
    if (value === null) {
        return null
    }

    if (!Array.isArray(value)) {
        return undefined
    }

    const links = value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)

    return links
}

function addStringUpdate(
    body: RequestBody,
    update: ReleaseUpdate,
    field: StringUpdateField
) {
    if (!Object.hasOwn(body, field)) {
        return true
    }

    const value = optionalString(body[field])

    if (value === undefined) {
        return false
    }

    update[field] = value

    return true
}

function buildReleaseUpdate(body: RequestBody) {
    const update: ReleaseUpdate = {
        updated_at: new Date().toISOString(),
    }

    const stringFields: StringUpdateField[] = [
        "status",
        "admin_status",
        "published_url",
        "report_title",
        "report_excel_url",
        "report_pdf_url",
        "admin_notes",
    ]

    for (const field of stringFields) {
        if (!addStringUpdate(body, update, field)) {
            return null
        }
    }

    if (Object.hasOwn(body, "live_article_links")) {
        const links = optionalStringArray(body.live_article_links)

        if (links === undefined) {
            return null
        }

        update.live_article_links = links
    }

    if (Object.prototype.hasOwnProperty.call(body, "content")) {
        update.content = sanitizePressReleaseHtml(body.content)
    }

    if (Object.keys(update).length === 1) {
        return null
    }

    return update
}

export async function OPTIONS() {
    return adminOptionsResponse()
}

export async function PATCH(request: Request, context: RouteContext) {
    try {
        const { admin, response } = await requireVerifiedAdmin(
            request,
            "admin-release-update"
        )

        if (response) {
            return response
        }

        const { id } = await context.params

        if (!id) {
            return badRequestResponse("Missing release ID")
        }

        let body: RequestBody

        try {
            body = (await request.json()) as RequestBody
        } catch {
            return badRequestResponse("Invalid body")
        }

        const releaseUpdate = buildReleaseUpdate(body)

        if (!releaseUpdate) {
            return badRequestResponse("Invalid body")
        }

        const { data, error } = await supabaseAdmin
            .from("press_releases")
            .update(releaseUpdate)
            .eq("id", id)
            .select("*")
            .maybeSingle()

        if (error) {
            console.error("[admin-release-update] Failed to update release", {
                adminEmail: admin.email,
                releaseId: id,
                error: error.message,
            })

            return serverErrorResponse()
        }

        if (!data) {
            return notFoundResponse()
        }

        const safeRelease = {
            ...data,
            content: sanitizePressReleaseHtml(data.content),
        }

        return jsonResponse(
            {
                success: true,
                release: safeRelease,
            },
            200
        )
    } catch (error) {
        console.error("[admin-release-update] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
