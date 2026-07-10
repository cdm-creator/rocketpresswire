import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RELEASE_IMAGE_BUCKET = "release-images"

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

function sanitizeFilename(filename: string) {
    const fallbackName = "release-image"
    const trimmedName = filename.trim() || fallbackName

    return trimmedName
        .replace(/[/\\]/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
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

        const file = formData.get("file")

        if (!(file instanceof File)) {
            return badRequestResponse("Missing file")
        }

        const timestamp = Date.now()
        const filename = sanitizeFilename(file.name)
        const storagePath = `release-images/${user.id}/${timestamp}-${filename}`

        const { error: uploadError } = await supabaseAdmin.storage
            .from(RELEASE_IMAGE_BUCKET)
            .upload(storagePath, file, {
                contentType: file.type || "application/octet-stream",
                upsert: false,
            })

        if (uploadError) {
            console.error("[release-image] Failed to upload image", {
                userId: user.id,
                error: uploadError.message,
            })

            return serverErrorResponse()
        }

        const {
            data: { publicUrl },
        } = supabaseAdmin.storage
            .from(RELEASE_IMAGE_BUCKET)
            .getPublicUrl(storagePath)

        return jsonResponse({ url: publicUrl }, 200)
    } catch (error) {
        console.error("[release-image] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
