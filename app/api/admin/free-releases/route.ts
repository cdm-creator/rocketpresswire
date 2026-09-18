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

function normalizeAdminFreeRelease(row: Record<string, any>) {
    return {
        ...row,
        release_title: row.release_title ?? row.title ?? "",
        subtitle: row.subtitle ?? row.summary ?? null,
        company_name: row.company_name ?? row.company ?? null,
        contact_information:
            row.contact_information ??
            [row.contact_name, row.contact_email, row.phone, row.full_address]
                .filter(Boolean)
                .join(" | ") ??
            null,
        release_content: row.release_content ?? row.content ?? "",
        customer_name: row.customer_name ?? row.contact_name ?? "",
        customer_email: row.customer_email ?? row.contact_email ?? "",
    }
}

export async function OPTIONS() {
    return adminOptionsResponse()
}

export async function GET(request: Request) {
    try {
        const activeAdmin = await requireActiveAdmin(request)
        const { data, error } = await supabaseAdmin
            .from("free_releases")
            .select("*")
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
                releases: (data ?? []).map((release) =>
                    normalizeAdminFreeRelease(
                        release as Record<string, any>
                    )
                ),
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
