import {
    AdminAuthorizationError,
    requireActiveAdmin,
} from "@/lib/requireActiveAdmin"

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

function jsonResponse(body: unknown, status: number) {
    console.log("[auth-role] Response status:", status)
    console.log("[auth-role] Returned JSON:", body)

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

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    })
}

export async function GET(request: Request) {
    try {
        const activeAdmin = await requireActiveAdmin(request)

        return jsonResponse(
            {
                role: "admin",
                admin: {
                    email: activeAdmin.email,
                    name: activeAdmin.admin.name,
                },
                redirect: ADMIN_REDIRECT_URL,
            },
            200
        )
    } catch (error) {
        if (error instanceof AdminAuthorizationError) {
            if (error.status === 401) {
                return unauthorizedResponse()
            }

            return jsonResponse(
                {
                    role: "customer",
                    redirect: CUSTOMER_REDIRECT_URL,
                },
                200
            )
        }

        console.error("[auth-role] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
