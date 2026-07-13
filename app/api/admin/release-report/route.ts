import { supabaseAdmin } from "@/lib/supabase-admin"
import {
    AdminAuthorizationError,
    requireActiveAdmin,
} from "@/lib/requireActiveAdmin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RELEASE_REPORTS_BUCKET = "release-reports"
const corsHeaders = {
    "Access-Control-Allow-Origin":
        "https://rocketpresswire.framer.website",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store, no-cache, must-revalidate",
}

type ReportType = "excel" | "pdf"

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, {
        status,
        headers: corsHeaders,
    })
}

function badRequestResponse(error: string) {
    return jsonResponse({ error }, 400)
}

function serverErrorResponse() {
    return jsonResponse({ error: "Server error" }, 500)
}

function sanitizeFilename(filename: string) {
    const fallbackName = "release-report"
    const trimmedName = filename.trim() || fallbackName

    return trimmedName
        .replace(/[/\\]/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
}

function normalizeReportType(value: FormDataEntryValue | null) {
    if (typeof value !== "string") {
        return null
    }

    const normalized = value.trim().toLowerCase()

    if (normalized !== "excel" && normalized !== "pdf") {
        return null
    }

    return normalized as ReportType
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    })
}

export async function POST(request: Request) {
    try {
        const activeAdmin = await requireActiveAdmin(request)

        let formData: FormData

        try {
            formData = await request.formData()
        } catch {
            return badRequestResponse("Invalid form data")
        }

        const file = formData.get("file")
        const releaseIdValue = formData.get("releaseId")
        const type = normalizeReportType(formData.get("type"))

        if (!(file instanceof File)) {
            return badRequestResponse("Missing file")
        }

        if (typeof releaseIdValue !== "string" || !releaseIdValue.trim()) {
            return badRequestResponse("Missing releaseId")
        }

        if (!type) {
            return badRequestResponse("Invalid report type")
        }

        const releaseId = releaseIdValue.trim()
        const timestamp = Date.now()
        const filename = sanitizeFilename(file.name)
        const storagePath = `${releaseId}/${type}-${timestamp}-${filename}`

        const { error: uploadError } = await supabaseAdmin.storage
            .from(RELEASE_REPORTS_BUCKET)
            .upload(storagePath, file, {
                contentType: file.type || "application/octet-stream",
                upsert: false,
            })

        if (uploadError) {
            console.error("[admin-release-report] Failed to upload report", {
                adminEmail: activeAdmin.email,
                releaseId,
                type,
                error: uploadError.message,
            })

            return serverErrorResponse()
        }

        const {
            data: { publicUrl },
        } = supabaseAdmin.storage
            .from(RELEASE_REPORTS_BUCKET)
            .getPublicUrl(storagePath)

        return jsonResponse({ url: publicUrl }, 200)
    } catch (error) {
        if (error instanceof AdminAuthorizationError) {
            return jsonResponse({ error: error.message }, error.status)
        }

        console.error("[admin-release-report] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
