import {
    adminJsonResponse,
    adminOptionsResponse,
    serverErrorResponse,
} from "@/lib/admin-auth"
import {
    AdminAuthorizationError,
    requireActiveAdmin,
} from "@/lib/requireActiveAdmin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function OPTIONS() {
    return adminOptionsResponse()
}

export async function GET(request: Request) {
    try {
        const activeAdmin = await requireActiveAdmin(request)

        return adminJsonResponse(
            {
                isAdmin: true,
                admin: {
                    email: activeAdmin.email,
                    name: activeAdmin.admin.name,
                },
            },
            200
        )
    } catch (error) {
        if (error instanceof AdminAuthorizationError) {
            return adminJsonResponse({ error: error.message }, error.status)
        }

        console.error("[admin-verify] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
