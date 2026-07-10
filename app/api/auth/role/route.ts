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

type AdminRow = {
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

        const { data: admins, error: adminError } = await supabaseAdmin
            .from("admins")
            .select("email, name, is_active")
            .eq("is_active", true)
            .eq("email", normalizedEmail)
            .limit(1)
            .returns<AdminRow[]>()

        if (adminError) {
            console.error("[auth-role] Failed to query admins", {
                error: adminError.message,
            })

            return serverErrorResponse()
        }

        const isAdmin = (admins ?? []).some(
            (admin) => normalizeEmail(admin.email) === normalizedEmail
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
