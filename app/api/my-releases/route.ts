import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = {
    "Access-Control-Allow-Origin":
        "https://rocketpresswire.framer.website",

    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers": "Content-Type, Authorization",

    "Cache-Control": "no-store, no-cache, must-revalidate",
}

type PressReleaseRow = {
    id: string
    user_email: string
    order_number: string | null
    website_url: string | null
    title: string | null
    summary: string | null
    featured_image_url: string | null
    content: string | null
    categories: unknown
    company: string | null
    contact_name: string | null
    contact_email: string | null
    full_address: string | null
    phone: string | null
    seo_title: string | null
    keywords: unknown
    meta_description: string | null
    status: string
    created_at: string
    updated_at?: string | null
}

type RequestBody = {
    order_number?: unknown
    website_url?: unknown
    title?: unknown
    summary?: unknown
    featured_image_url?: unknown
    content?: unknown
    categories?: unknown
    company?: unknown
    contact_name?: unknown
    contact_email?: unknown
    full_address?: unknown
    phone?: unknown
    seo_title?: unknown
    keywords?: unknown
    meta_description?: unknown
    status?: unknown
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

async function getVerifiedUserEmail(request: Request) {
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

    const userEmail = user.email?.trim().toLowerCase()

    if (!userEmail) {
        return { response: unauthorizedResponse() }
    }

    return { userEmail }
}

function optionalString(value: unknown) {
    if (value === undefined || value === null) {
        return null
    }

    if (typeof value !== "string") {
        return undefined
    }

    const trimmedValue = value.trim()

    return trimmedValue === "" ? null : trimmedValue
}

function normalizeStatus(value: unknown) {
    if (value === undefined || value === null) {
        return "draft"
    }

    if (typeof value !== "string") {
        return undefined
    }

    const trimmedValue = value.trim()

    return trimmedValue === "" ? "draft" : trimmedValue
}

function buildReleaseInsert(body: RequestBody, userEmail: string) {
    const stringFields = {
        order_number: optionalString(body.order_number),
        website_url: optionalString(body.website_url),
        title: optionalString(body.title),
        summary: optionalString(body.summary),
        featured_image_url: optionalString(body.featured_image_url),
        content: optionalString(body.content),
        company: optionalString(body.company),
        contact_name: optionalString(body.contact_name),
        contact_email: optionalString(body.contact_email),
        full_address: optionalString(body.full_address),
        phone: optionalString(body.phone),
        seo_title: optionalString(body.seo_title),
        meta_description: optionalString(body.meta_description),
    }

    if (Object.values(stringFields).some((value) => value === undefined)) {
        return null
    }

    const status = normalizeStatus(body.status)

    if (status === undefined) {
        return null
    }

    
    return {
        user_email: userEmail,
        ...stringFields,
        categories: body.categories ?? null,
        keywords: body.keywords ?? null,
        status,
    }
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    })
}

export async function GET(request: Request) {
    try {
        const { userEmail, response } = await getVerifiedUserEmail(request)

        if (response) {
            return response
        }

        const { data, error } = await supabaseAdmin
            .from("press_releases")
            .select("*")
            .eq("user_email", userEmail)
            .order("created_at", { ascending: false })
            .returns<PressReleaseRow[]>()

        if (error) {
            console.error("[my-releases] Failed to query press releases", {
                userEmail,
                error: error.message,
            })

            return serverErrorResponse()
        }

        return jsonResponse({ releases: data ?? [] }, 200)
    } catch (error) {
        console.error("[my-releases] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}

export async function POST(request: Request) {
    try {
        const { userEmail, response } = await getVerifiedUserEmail(request)

        if (response) {
            return response
        }

        let body: RequestBody

        try {
            body = (await request.json()) as RequestBody
        } catch {
            return badRequestResponse("Invalid body")
        }

        const releaseInsert = buildReleaseInsert(body, userEmail)

        if (!releaseInsert) {
            return badRequestResponse("Invalid body")
        }

        const { data, error } = await supabaseAdmin
            .from("press_releases")
            .insert(releaseInsert)
            .select("*")
            .single<PressReleaseRow>()

        if (error) {
            console.error("[my-releases] Failed to create press release", {
                userEmail,
                error: error.message,
            })

            return serverErrorResponse()
        }

        return jsonResponse({ release: data }, 201)
    } catch (error) {
        console.error("[my-releases] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
