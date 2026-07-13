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
type ReportColumn = "report_excel_url" | "report_pdf_url"

type DeleteRequestBody = {
    releaseId?: unknown
    type?: unknown
}

type ReleaseReportRow = {
    id: string
    report_pdf_url: string | null
    report_excel_url: string | null
}

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

function normalizeJsonReportType(value: unknown) {
    if (typeof value !== "string") {
        return null
    }

    const normalized = value.trim().toLowerCase()

    if (normalized !== "excel" && normalized !== "pdf") {
        return null
    }

    return normalized as ReportType
}

function getReportColumn(type: ReportType): ReportColumn {
    return type === "pdf" ? "report_pdf_url" : "report_excel_url"
}

function getReleaseReportObjectPath(reportUrl: string) {
    const supabaseUrl = process.env.SUPABASE_URL

    if (!supabaseUrl) {
        return null
    }

    let parsedReportUrl: URL
    let parsedSupabaseUrl: URL

    try {
        parsedReportUrl = new URL(reportUrl)
        parsedSupabaseUrl = new URL(supabaseUrl)
    } catch {
        return null
    }

    if (parsedReportUrl.host !== parsedSupabaseUrl.host) {
        return null
    }

    const pathSegments = parsedReportUrl.pathname.split("/").filter(Boolean)
    const [storage, version, object, accessType, bucket, ...objectSegments] =
        pathSegments

    if (
        storage !== "storage" ||
        version !== "v1" ||
        object !== "object" ||
        (accessType !== "public" && accessType !== "sign")
    ) {
        return null
    }

    let decodedBucket: string
    let decodedObjectSegments: string[]

    try {
        decodedBucket = decodeURIComponent(bucket ?? "")
        decodedObjectSegments = objectSegments.map((segment) =>
            decodeURIComponent(segment)
        )
    } catch {
        return null
    }

    if (decodedBucket !== RELEASE_REPORTS_BUCKET) {
        return null
    }

    if (
        decodedObjectSegments.length === 0 ||
        decodedObjectSegments.some(
            (segment) => !segment || segment === "." || segment === ".."
        )
    ) {
        return null
    }

    const objectPath = decodedObjectSegments.join("/")

    return objectPath.trim() ? objectPath : null
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

export async function DELETE(request: Request) {
    try {
        const activeAdmin = await requireActiveAdmin(request)

        let body: DeleteRequestBody

        try {
            body = (await request.json()) as DeleteRequestBody
        } catch {
            return badRequestResponse("Invalid body")
        }

        const releaseId =
            typeof body.releaseId === "string" ? body.releaseId.trim() : ""
        const type = normalizeJsonReportType(body.type)

        if (!releaseId) {
            return badRequestResponse("Invalid releaseId")
        }

        if (!type) {
            return badRequestResponse("Invalid report type")
        }

        const reportColumn = getReportColumn(type)

        const { data: release, error: releaseError } = await supabaseAdmin
            .from("press_releases")
            .select("id, report_pdf_url, report_excel_url")
            .eq("id", releaseId)
            .maybeSingle<ReleaseReportRow>()

        if (releaseError) {
            console.error("[admin-release-report] Failed to read release", {
                adminEmail: activeAdmin.email,
                releaseId,
                type,
                error: releaseError.message,
            })

            return serverErrorResponse()
        }

        if (!release) {
            return jsonResponse({ error: "Release not found" }, 404)
        }

        const reportUrl = release[reportColumn]?.trim() ?? ""

        if (!reportUrl) {
            const { error: updateError } = await supabaseAdmin
                .from("press_releases")
                .update({ [reportColumn]: null })
                .eq("id", release.id)

            if (updateError) {
                console.error(
                    "[admin-release-report] Failed to clear empty report URL",
                    {
                        adminEmail: activeAdmin.email,
                        releaseId,
                        type,
                        error: updateError.message,
                    }
                )

                return serverErrorResponse()
            }

            return jsonResponse(
                {
                    success: true,
                    releaseId: release.id,
                    type,
                    deleted: false,
                },
                200
            )
        }

        const objectPath = getReleaseReportObjectPath(reportUrl)

        if (objectPath) {
            const { error: removeError } = await supabaseAdmin.storage
                .from(RELEASE_REPORTS_BUCKET)
                .remove([objectPath])

            if (removeError) {
                console.error(
                    "[admin-release-report] Failed to delete report file",
                    {
                        adminEmail: activeAdmin.email,
                        releaseId,
                        type,
                        error: removeError.message,
                    }
                )

                return serverErrorResponse()
            }
        }

        const { error: updateError } = await supabaseAdmin
            .from("press_releases")
            .update({ [reportColumn]: null })
            .eq("id", release.id)

        if (updateError) {
            console.error("[admin-release-report] Failed to clear report URL", {
                adminEmail: activeAdmin.email,
                releaseId,
                type,
                error: updateError.message,
            })

            return serverErrorResponse()
        }

        return jsonResponse(
            {
                success: true,
                releaseId: release.id,
                type,
                deleted: Boolean(objectPath),
            },
            200
        )
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
