import { supabaseAdmin } from "@/lib/supabase-admin"
import {
    ADMIN_CORS_HEADERS,
    adminOptionsResponse,
} from "@/lib/admin-auth"
import {
    AdminAuthorizationError,
    requireActiveAdmin,
} from "@/lib/requireActiveAdmin"
import { SOURCE_DOCUMENT_BUCKET } from "@/lib/source-document"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SIGNED_URL_EXPIRES_IN_SECONDS = 120
const corsHeaders = ADMIN_CORS_HEADERS

type RouteContext = {
    params: Promise<{
        id?: string
    }>
}

type SourceDocumentReleaseRow = {
    id: string
    source_document_path: string | null
    source_document_name: string | null
    source_document_mime_type: string | null
    source_document_size_bytes: number | null
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

function notFoundResponse() {
    return jsonResponse({ error: "Source document not found" }, 404)
}

function serverErrorResponse() {
    return jsonResponse({ error: "Server error" }, 500)
}

export async function OPTIONS() {
    return adminOptionsResponse()
}

export async function GET(request: Request, context: RouteContext) {
    try {
        const activeAdmin = await requireActiveAdmin(request)
        const { id } = await context.params

        if (!id) {
            return badRequestResponse("Missing release ID")
        }

        const { data: release, error: releaseError } = await supabaseAdmin
            .from("press_releases")
            .select(
                `
                id,
                source_document_path,
                source_document_name,
                source_document_mime_type,
                source_document_size_bytes
            `
            )
            .eq("id", id)
            .maybeSingle<SourceDocumentReleaseRow>()

        if (releaseError) {
            console.error(
                "[admin-release-source-document] Failed to read release",
                {
                    adminEmail: activeAdmin.email,
                    releaseId: id,
                    error: releaseError.message,
                }
            )

            return serverErrorResponse()
        }

        const sourceDocumentPath = release?.source_document_path?.trim()

        if (!release || !sourceDocumentPath) {
            return notFoundResponse()
        }

        const { data, error: signedUrlError } = await supabaseAdmin.storage
            .from(SOURCE_DOCUMENT_BUCKET)
            .createSignedUrl(
                sourceDocumentPath,
                SIGNED_URL_EXPIRES_IN_SECONDS
            )

        if (signedUrlError || !data?.signedUrl) {
            console.error(
                "[admin-release-source-document] Failed to create signed URL",
                {
                    adminEmail: activeAdmin.email,
                    releaseId: id,
                    error: signedUrlError?.message ?? "Missing signed URL",
                }
            )

            return serverErrorResponse()
        }

        return jsonResponse(
            {
                url: data.signedUrl,
                name: release.source_document_name,
                mime_type: release.source_document_mime_type,
                size_bytes: release.source_document_size_bytes,
                expires_in: SIGNED_URL_EXPIRES_IN_SECONDS,
            },
            200
        )
    } catch (error) {
        if (error instanceof AdminAuthorizationError) {
            return jsonResponse({ error: error.message }, error.status)
        }

        console.error("[admin-release-source-document] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
