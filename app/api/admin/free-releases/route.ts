import {
    ADMIN_CORS_HEADERS,
    adminOptionsResponse,
} from "@/lib/admin-auth"
import {
    AdminAuthorizationError,
    requireActiveAdmin,
} from "@/lib/requireActiveAdmin"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, { status, headers: ADMIN_CORS_HEADERS })
}

export async function OPTIONS() {
    return adminOptionsResponse()
}

export async function GET(request: Request) {
    try {
        const activeAdmin = await requireActiveAdmin(request)
        const { data, error } = await supabaseAdmin
            .from("free_releases")
            .select(
                `
                id,
                release_id,
                user_id,
                customer_name,
                customer_email,
                release_title,
                subtitle,
                company_name,
                contact_information,
                release_content,
                media_files,
                writing_option,
                status,
                admin_status,
                published_url,
                report_file,
                created_at,
                updated_at
            `
            )
            .order("created_at", { ascending: false })

        if (error) {
            console.error("[admin-free-releases] Failed to query releases", {
                adminEmail: activeAdmin.email,
                error: error.message,
            })
            return jsonResponse({ error: "Server error" }, 500)
        }

        return jsonResponse(
            {
                admin: {
                    email: activeAdmin.email,
                    name: activeAdmin.admin.name,
                },
                releases: data ?? [],
            },
            200
        )
    } catch (error) {
        if (error instanceof AdminAuthorizationError) {
            return jsonResponse({ error: error.message }, error.status)
        }

        console.error("[admin-free-releases] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })
        return jsonResponse({ error: "Server error" }, 500)
    }
}
