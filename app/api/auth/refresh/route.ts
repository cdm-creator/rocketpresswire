import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = {
    "Access-Control-Allow-Origin":
        "https://rocketpresswire.framer.website",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

type RefreshRequestBody = {
    refresh_token?: unknown
}

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, {
        status,
        headers: corsHeaders,
    })
}

function getSupabaseAuthClient() {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseAnonKey =
        process.env.SUPABASE_ANON_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Missing Supabase auth configuration")
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    })
}

export async function POST(request: Request) {
    let body: RefreshRequestBody

    try {
        body = (await request.json()) as RefreshRequestBody
    } catch {
        return jsonResponse({ error: "Refresh token is required" }, 400)
    }

    const refreshToken =
        typeof body.refresh_token === "string"
            ? body.refresh_token.trim()
            : ""

    if (!refreshToken) {
        return jsonResponse({ error: "Refresh token is required" }, 400)
    }

    try {
        const supabase = getSupabaseAuthClient()

        const { data, error } = await supabase.auth.refreshSession({
            refresh_token: refreshToken,
        })

        if (error || !data.session) {
            return jsonResponse({ error: "Session expired" }, 401)
        }

        const { session } = data

        return jsonResponse(
            {
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                expires_at: session.expires_at,
                expires_in: session.expires_in,
            },
            200
        )
    } catch (error) {
        console.error("[auth-refresh] Failed to refresh session", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return jsonResponse({ error: "Session expired" }, 401)
    }
}
