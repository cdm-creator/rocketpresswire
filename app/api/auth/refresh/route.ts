import { createClient } from "@supabase/supabase-js"
import { createHash } from "crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = {
    "Access-Control-Allow-Origin":
        "https://rocketpresswire.framer.website",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store, no-cache, must-revalidate",
}

type RefreshRequestBody = {
    refresh_token?: unknown
}

type RefreshSuccessBody = {
    access_token: string
    refresh_token: string
    expires_at?: number
    expires_in: number
    session: {
        access_token: string
        refresh_token: string
        expires_at?: number
        expires_in: number
    }
}

type RefreshResult =
    | {
          body: RefreshSuccessBody
          status: 200
      }
    | {
          body: { error: string }
          status: 401 | 503
      }

const RECENT_REFRESH_TTL_MS = 30_000
const inFlightRefreshes = new Map<string, Promise<RefreshResult>>()
const recentRefreshes = new Map<
    string,
    {
        expiresAt: number
        body: RefreshSuccessBody
    }
>()

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, {
        status,
        headers: corsHeaders,
    })
}

function getRefreshTokenCacheKey(refreshToken: string) {
    return createHash("sha256").update(refreshToken).digest("hex")
}

function getErrorStatus(error: unknown) {
    const status =
        typeof error === "object" && error !== null && "status" in error
            ? Number((error as { status?: unknown }).status)
            : null

    return Number.isFinite(status) ? status : null
}

function isTemporaryRefreshFailure(error: unknown) {
    const status = getErrorStatus(error)

    return status !== null && (status >= 500 || status === 429)
}

function getErrorLogData(error: unknown) {
    if (error instanceof Error) {
        return {
            message: error.message,
            status: getErrorStatus(error),
        }
    }

    return {
        message: "Unknown error",
        status: getErrorStatus(error),
    }
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

async function refreshSession(refreshToken: string): Promise<RefreshResult> {
    try {
        const supabase = getSupabaseAuthClient()

        const { data, error } = await supabase.auth.refreshSession({
            refresh_token: refreshToken,
        })

        if (error || !data.session) {
            if (isTemporaryRefreshFailure(error)) {
                console.error("[auth-refresh] Temporary Supabase refresh failure", {
                    error: getErrorLogData(error),
                })

                return {
                    body: { error: "Temporary refresh failure" },
                    status: 503,
                }
            }

            return {
                body: { error: "Session expired" },
                status: 401,
            }
        }

        const { session } = data

        const successBody = {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            expires_in: session.expires_in,
            session: {
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                expires_at: session.expires_at,
                expires_in: session.expires_in,
            },
        }

        return {
            body: successBody,
            status: 200,
        }
    } catch (error) {
        console.error("[auth-refresh] Failed to refresh session", {
            error: getErrorLogData(error),
        })

        return {
            body: { error: "Temporary refresh failure" },
            status: 503,
        }
    }
}

async function refreshSessionWithRaceCache(refreshToken: string) {
    const cacheKey = getRefreshTokenCacheKey(refreshToken)
    const cachedRefresh = recentRefreshes.get(cacheKey)

    if (cachedRefresh && cachedRefresh.expiresAt > Date.now()) {
        return {
            body: cachedRefresh.body,
            status: 200,
        } satisfies RefreshResult
    }

    if (cachedRefresh) {
        recentRefreshes.delete(cacheKey)
    }

    const inFlightRefresh = inFlightRefreshes.get(cacheKey)

    if (inFlightRefresh) {
        return inFlightRefresh
    }

    const refreshPromise = refreshSession(refreshToken)

    inFlightRefreshes.set(cacheKey, refreshPromise)

    try {
        const result = await refreshPromise

        if (result.status === 200) {
            recentRefreshes.set(cacheKey, {
                body: result.body,
                expiresAt: Date.now() + RECENT_REFRESH_TTL_MS,
            })
        }

        return result
    } finally {
        inFlightRefreshes.delete(cacheKey)
    }
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

    const result = await refreshSessionWithRaceCache(refreshToken)

    return jsonResponse(result.body, result.status)
}
