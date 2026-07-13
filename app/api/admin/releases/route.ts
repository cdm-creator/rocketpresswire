import { supabaseAdmin } from "@/lib/supabase-admin"
import {
    ADMIN_CORS_HEADERS,
    adminOptionsResponse,
} from "@/lib/admin-auth"
import { sanitizePressReleaseHtml } from "@/lib/sanitizePressReleaseHtml"
import {
    AdminAuthorizationError,
    requireActiveAdmin,
} from "@/lib/requireActiveAdmin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = ADMIN_CORS_HEADERS

type PressReleaseRow = {
    id: string
    user_email: string | null
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
    status: string | null
    admin_status: string | null
    published_url: string | null
    live_article_links: unknown
    report_title: string | null
    report_excel_url: string | null
    report_pdf_url: string | null
    admin_notes: string | null
    created_at: string
    updated_at: string | null
}

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, {
        status,
        headers: corsHeaders,
    })
}

function serverErrorResponse() {
    return jsonResponse({ error: "Server error" }, 500)
}

export async function OPTIONS() {
    return adminOptionsResponse()
}

export async function GET(request: Request) {
    try {
        const activeAdmin = await requireActiveAdmin(request)

        const { data, error } = await supabaseAdmin
            .from("press_releases")
            .select("*")
            .order("created_at", { ascending: false })
            .returns<PressReleaseRow[]>()

        if (error) {
            console.error("[admin-releases] Failed to query press releases", {
                adminEmail: activeAdmin.email,
                error: error.message,
            })

            return serverErrorResponse()
        }

        const safeReleases = (data ?? []).map((release) => ({
            ...release,
            content: sanitizePressReleaseHtml(release.content),
        }))

        return jsonResponse(
            {
                admin: {
                    email: activeAdmin.email,
                    name: activeAdmin.admin.name,
                },
                releases: safeReleases,
            },
            200
        )
    } catch (error) {
        if (error instanceof AdminAuthorizationError) {
            return jsonResponse({ error: error.message }, error.status)
        }

        console.error("[admin-releases] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return serverErrorResponse()
    }
}
