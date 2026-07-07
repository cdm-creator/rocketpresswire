import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = {
    "Access-Control-Allow-Origin":
        "https://rocketpresswire.framer.website",

    "Access-Control-Allow-Methods":
        "GET, OPTIONS",

    "Access-Control-Allow-Headers":
        "Content-Type, Authorization",
}

const ADMIN_REDIRECT_URL = "https://rocketpresswire.framer.website/admin"
const CUSTOMER_REDIRECT_URL = "https://rocketpresswire.framer.website/portal"

type AdminUserRow = {
    email: string
    name: string | null
    is_active: boolean
}

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, {
        status,
        headers: corsHeaders,
    })
}

function unauthorizedResponse(error = "Unauthorized") {
    return jsonResponse({ error }, 401)
}

function serverErrorResponse() {
    return jsonResponse({ error: "Unable to determine user role" }, 500)
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

    if (scheme !== "Bearer" || !token) {
        return null
    }

    return token.trim() || null
}

function normalizeEmail(email: string | null | undefined) {
    return email?.trim().toLowerCase() ?? ""
}

function escapeLikePattern(value: string) {
    return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    })
}

export async function GET(request: Request) {
    const accessToken = getBearerToken(request)

    if (!accessToken) {
        return unauthorizedResponse()
    }

    try {
        const {
            data: { user },
            error: authError,
        } = await supabaseAdmin.auth.getUser(accessToken)

        if (authError || !user) {
            return unauthorizedResponse()
        }

        const normalizedEmail = normalizeEmail(user.email)

        if (!normalizedEmail) {
            return unauthorizedResponse("Authenticated user has no email")
        }

        const { data: adminUsers, error: adminError } = await supabaseAdmin
            .from("admin_users")
            .select("email, name, is_active")
            .eq("is_active", true)
            .ilike("email", escapeLikePattern(normalizedEmail))
            .limit(1)
            .returns<AdminUserRow[]>()

        if (adminError) {
            console.error("[auth-role] Failed to query admin_users", {
                error: adminError.message,
            })

            return serverErrorResponse()
        }

        const isAdmin = (adminUsers ?? []).some(
            (adminUser) => normalizeEmail(adminUser.email) === normalizedEmail
        )

        if (isAdmin) {
            return jsonResponse(
                {
                    role: "admin",
                    redirect: ADMIN_REDIRECT_URL,
                },
                200
            )
        }

        return jsonResponse(
            {
                role: "customer",
                redirect: CUSTOMER_REDIRECT_URL,
            },
            200
        )
    } catch (error) {
        console.error("[auth-role] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
