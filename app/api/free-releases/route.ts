import { generateFreeReleaseId } from "@/lib/free-release-id"
import { sanitizePressReleaseHtml } from "@/lib/sanitizePressReleaseHtml"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = {
    "Access-Control-Allow-Origin": "https://rocketpresswire.com",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store, no-cache, must-revalidate",
}

const FREE_RELEASE_SELECT = `
    release_id,
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
    created_at
`

type RequestBody = {
    customer_name?: unknown
    customer_email?: unknown
    release_title?: unknown
    subtitle?: unknown
    company_name?: unknown
    contact_information?: unknown
    release_content?: unknown
    media_files?: unknown
}

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, { status, headers: corsHeaders })
}

function getBearerToken(request: Request) {
    const authorization = request.headers.get("authorization")

    if (!authorization) return null

    const [scheme, token] = authorization.split(" ")

    if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) return null

    return token.trim()
}

async function getVerifiedUser(request: Request) {
    const accessToken = getBearerToken(request)

    if (!accessToken) {
        return { response: jsonResponse({ error: "Unauthorized" }, 401) }
    }

    const {
        data: { user },
        error,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (error || !user) {
        return { response: jsonResponse({ error: "Unauthorized" }, 401) }
    }

    return { user }
}

function requiredString(value: unknown) {
    if (typeof value !== "string") return null

    return value.trim() || null
}

function optionalString(value: unknown) {
    if (value === undefined || value === null) return null
    if (typeof value !== "string") return undefined

    return value.trim() || null
}

function normalizeMediaFiles(value: unknown) {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value)) return null

    const files = value.filter(
        (item) =>
            typeof item === "string" ||
            (typeof item === "object" && item !== null && !Array.isArray(item))
    )

    return files.length === value.length ? files : null
}

function buildFreeReleaseInsert(body: RequestBody, userEmail: string) {
    const customerName = requiredString(body.customer_name)
    const releaseTitle = requiredString(body.release_title)
    const companyName = requiredString(body.company_name)
    const contactInformation = requiredString(body.contact_information)
    const releaseContent = requiredString(body.release_content)
    const subtitle = optionalString(body.subtitle)
    const mediaFiles = normalizeMediaFiles(body.media_files)

    if (
        !customerName ||
        !releaseTitle ||
        !companyName ||
        !contactInformation ||
        !releaseContent ||
        subtitle === undefined ||
        mediaFiles === null
    ) {
        return null
    }

    return {
        customer_name: customerName,
        customer_email: userEmail,
        release_title: releaseTitle,
        subtitle,
        company_name: companyName,
        contact_information: contactInformation,
        release_content: sanitizePressReleaseHtml(releaseContent),
        media_files: mediaFiles,
        writing_option: "own",
        status: "Submitted",
        admin_status: "Submitted",
    }
}

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: Request) {
    try {
        const { user, response } = await getVerifiedUser(request)

        if (response) return response

        const { data, error } = await supabaseAdmin
            .from("free_releases")
            .select(FREE_RELEASE_SELECT)
            .eq("user_id", user.id)
            .maybeSingle()

        if (error) {
            console.error("[free-releases] Failed to query free release", {
                userId: user.id,
                error: error.message,
            })
            return jsonResponse({ error: "Server error" }, 500)
        }

        return jsonResponse({ release: data ?? null }, 200)
    } catch (error) {
        console.error("[free-releases] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })
        return jsonResponse({ error: "Server error" }, 500)
    }
}

export async function POST(request: Request) {
    try {
        const { user, response } = await getVerifiedUser(request)

        if (response) return response

        const userEmail = user.email?.trim().toLowerCase()

        if (!userEmail) {
            return jsonResponse({ error: "Unauthorized" }, 401)
        }

        const { data: existingRelease, error: existingError } =
            await supabaseAdmin
                .from("free_releases")
                .select("id")
                .eq("user_id", user.id)
                .maybeSingle()

        if (existingError) {
            console.error("[free-releases] Failed to check existing release", {
                userId: user.id,
                error: existingError.message,
            })
            return jsonResponse({ error: "Server error" }, 500)
        }

        if (existingRelease) {
            return jsonResponse(
                { error: "Free release already submitted" },
                400
            )
        }

        let body: RequestBody

        try {
            body = (await request.json()) as RequestBody
        } catch {
            return jsonResponse({ error: "Invalid body" }, 400)
        }

        const insert = buildFreeReleaseInsert(body, userEmail)

        if (!insert) {
            return jsonResponse({ error: "Invalid body" }, 400)
        }

        // A retry protects sequential ID allocation when simultaneous requests
        // compete for the same release_id and the table's unique key rejects one.
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const releaseId = await generateFreeReleaseId()
            const { data, error } = await supabaseAdmin
                .from("free_releases")
                .insert({
                    ...insert,
                    release_id: releaseId,
                    user_id: user.id,
                })
                .select(FREE_RELEASE_SELECT)
                .single()

            if (!error) {
                return jsonResponse(
                    { success: true, release_id: releaseId, release: data },
                    201
                )
            }

            if (error.code === "23505") {
                const { data: userRelease, error: userReleaseError } =
                    await supabaseAdmin
                        .from("free_releases")
                        .select("id")
                        .eq("user_id", user.id)
                        .maybeSingle()

                if (!userReleaseError && userRelease) {
                    return jsonResponse(
                        { error: "Free release already submitted" },
                        400
                    )
                }

                continue
            }

            console.error("[free-releases] Failed to create free release", {
                userId: user.id,
                error: error.message,
            })
            return jsonResponse({ error: "Server error" }, 500)
        }

        console.error("[free-releases] Exhausted release ID retries", {
            userId: user.id,
        })
        return jsonResponse({ error: "Server error" }, 500)
    } catch (error) {
        console.error("[free-releases] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })
        return jsonResponse({ error: "Server error" }, 500)
    }
}
