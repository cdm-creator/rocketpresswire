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

type CustomerProfileRow = {
    id?: string
    user_email: string
    name: string | null
    company: string | null
    phone: string | null
    website: string | null
    created_at?: string | null
    updated_at?: string | null
}

type RequestBody = {
    name?: unknown
    company?: unknown
    phone?: unknown
    website?: unknown
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

function emptyProfile(userEmail: string): CustomerProfileRow {
    return {
        user_email: userEmail,
        name: null,
        company: null,
        phone: null,
        website: null,
    }
}

function buildProfileUpsert(body: RequestBody, userEmail: string) {
    const profile = {
        user_email: userEmail,
        name: optionalString(body.name),
        company: optionalString(body.company),
        phone: optionalString(body.phone),
        website: optionalString(body.website),
    }

    if (
        profile.name === undefined ||
        profile.company === undefined ||
        profile.phone === undefined ||
        profile.website === undefined
    ) {
        return null
    }

    return profile
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
            .from("customer_profiles")
            .select("*")
            .eq("user_email", userEmail)
            .maybeSingle<CustomerProfileRow>()

        if (error) {
            console.error("[profile] Failed to query customer profile", {
                userEmail,
                error: error.message,
            })

            return serverErrorResponse()
        }

        return jsonResponse({ profile: data ?? emptyProfile(userEmail) }, 200)
    } catch (error) {
        console.error("[profile] Server error", {
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

        const profileUpsert = buildProfileUpsert(body, userEmail)

        if (!profileUpsert) {
            return badRequestResponse("Invalid body")
        }

        const { data, error } = await supabaseAdmin
            .from("customer_profiles")
            .upsert(profileUpsert, {
                onConflict: "user_email",
            })
            .select("*")
            .single<CustomerProfileRow>()

        if (error) {
            console.error("[profile] Failed to save customer profile", {
                userEmail,
                error: error.message,
            })

            return serverErrorResponse()
        }

        return jsonResponse({ profile: data }, 200)
    } catch (error) {
        console.error("[profile] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
