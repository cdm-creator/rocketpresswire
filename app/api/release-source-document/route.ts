import { randomUUID } from "crypto"
import { supabaseAdmin } from "@/lib/supabase-admin"
import {
    getSourceDocumentExtension,
    isValidSourceDocumentSize,
    normalizeSourceDocumentMimeType,
    sanitizeSourceDocumentFilename,
    SOURCE_DOCUMENT_BUCKET,
    SOURCE_DOCUMENT_MAX_SIZE_BYTES,
} from "@/lib/source-document"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = {
    "Access-Control-Allow-Origin":
        "https://rocketpresswire.framer.website",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store, no-cache, must-revalidate",
}

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, {
        status,
        headers: corsHeaders,
    })
}

function unauthorizedResponse() {
    return jsonResponse({ error: "Unauthorized" }, 401)
}

function badRequestResponse(error: string) {
    return jsonResponse({ error }, 400)
}

function payloadTooLargeResponse() {
    return jsonResponse({ error: "File is larger than 20 MB" }, 413)
}

function serverErrorResponse() {
    return jsonResponse({ error: "Server error" }, 500)
}

function getBearerToken(request: Request) {
    const authorization = request.headers.get("authorization")

    if (!authorization) {
        return null
    }

    const [scheme, token] = authorization.split(" ")

    if (scheme !== "Bearer" || !token) {
        return null
    }

    return token.trim() || null
}

async function getVerifiedUser(request: Request) {
    const accessToken = getBearerToken(request)

    if (!accessToken) {
        return { response: unauthorizedResponse() }
    }

    const {
        data: { user },
        error: authError,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (authError || !user) {
        return { response: unauthorizedResponse() }
    }

    return { user }
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    })
}

export async function POST(request: Request) {
    try {
        const { user, response } = await getVerifiedUser(request)

        if (response) {
            return response
        }

        let formData: FormData

        try {
            formData = await request.formData()
        } catch {
            return badRequestResponse("Invalid form data")
        }

        const files = formData.getAll("file")
        const file = files[0]

        if (files.length !== 1 || !(file instanceof File)) {
            return badRequestResponse("Missing file")
        }

        if (!isValidSourceDocumentSize(file.size)) {
            if (file.size > SOURCE_DOCUMENT_MAX_SIZE_BYTES) {
                return payloadTooLargeResponse()
            }

            return badRequestResponse("Invalid file")
        }

        const extension = getSourceDocumentExtension(file.name)

        if (!extension) {
            return badRequestResponse("Unsupported file extension")
        }

        const sanitizedFilename = sanitizeSourceDocumentFilename(file.name)
        const mimeType = normalizeSourceDocumentMimeType(extension, file.type)
        const storagePath = `${user.id}/${randomUUID()}-${sanitizedFilename}`

        const { error: uploadError } = await supabaseAdmin.storage
            .from(SOURCE_DOCUMENT_BUCKET)
            .upload(storagePath, file, {
                contentType: mimeType,
                upsert: false,
            })

        if (uploadError) {
            console.error(
                "[release-source-document] Failed to upload source document",
                {
                    userId: user.id,
                    error: uploadError.message,
                }
            )

            return serverErrorResponse()
        }

        return jsonResponse(
            {
                path: storagePath,
                name: file.name,
                mime_type: mimeType,
                size_bytes: file.size,
            },
            200
        )
    } catch (error) {
        console.error("[release-source-document] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
