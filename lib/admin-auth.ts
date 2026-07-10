import { supabaseAdmin } from "@/lib/supabase-admin"

export const ADMIN_CORS_HEADERS = {
    "Access-Control-Allow-Origin":
        "https://rocketpresswire.framer.website",
    "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store, no-cache, must-revalidate",
}

type AdminRow = {
    id: string
    email: string
    name?: string | null
    is_active: boolean
}

export type VerifiedAdmin = {
    email: string
    name: string | null
}

export function adminJsonResponse(body: unknown, status: number) {
    return Response.json(body, {
        status,
        headers: ADMIN_CORS_HEADERS,
    })
}

export function adminOptionsResponse() {
    return new Response(null, {
        status: 204,
        headers: ADMIN_CORS_HEADERS,
    })
}

export function unauthorizedResponse() {
    return adminJsonResponse({ error: "Unauthorized" }, 401)
}

export function forbiddenResponse() {
    return adminJsonResponse({ error: "Forbidden" }, 403)
}

export function serverErrorResponse() {
    return adminJsonResponse({ error: "Server error" }, 500)
}

function normalizeText(value: string | null | undefined) {
    return value?.trim().toLowerCase() ?? ""
}

function getBearerToken(request: Request) {
    const authorization = request.headers.get("authorization")

    if (!authorization) {
        return null
    }

    const parts = authorization.split(" ")

    if (parts.length !== 2) {
        return null
    }

    const [scheme, token] = parts

    if (scheme.toLowerCase() !== "bearer" || !token) {
        return null
    }

    return token.trim() || null
}

export async function requireVerifiedAdmin(
    request: Request,
    logPrefix: string
): Promise<
    | { admin: VerifiedAdmin; response?: never }
    | { admin?: never; response: Response }
> {
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

    const adminEmail = normalizeText(user.email)

    if (!adminEmail) {
        return { response: unauthorizedResponse() }
    }

    const { data: admin, error: adminError } = await supabaseAdmin
        .from("admin_users")
        .select("id,email,name,is_active")
        .eq("email", adminEmail)
        .eq("is_active", true)
        .single<AdminRow>()

    if (adminError) {
        if (adminError.code === "PGRST116") {
            return { response: forbiddenResponse() }
        }

        console.error(`[${logPrefix}] Failed to query admin_users`, {
            adminEmail,
            error: adminError.message,
        })

        return { response: serverErrorResponse() }
    }

    if (!admin) {
        return { response: forbiddenResponse() }
    }

    return {
        admin: {
            email: adminEmail,
            name: typeof admin.name === "string" ? admin.name : null,
        },
    }
}
