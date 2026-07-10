import {
    adminJsonResponse,
    adminOptionsResponse,
    requireVerifiedAdmin,
    serverErrorResponse,
} from "@/lib/admin-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function OPTIONS() {
    return adminOptionsResponse()
}

export async function GET(request: Request) {
    try {
        const { admin, response } = await requireVerifiedAdmin(
            request,
            "admin-verify"
        )

        if (response) {
            return response
        }

        return adminJsonResponse(
            {
                isAdmin: true,
                admin,
            },
            200
        )
    } catch (error) {
        console.error("[admin-verify] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
