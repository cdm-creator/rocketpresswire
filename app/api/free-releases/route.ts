import { generateFreeReleaseId } from "@/lib/free-release-id"
import { sanitizePressReleaseHtml } from "@/lib/sanitizePressReleaseHtml"
import { normalizeSourceDocumentMetadata } from "@/lib/source-document"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = {
    "Access-Control-Allow-Origin": "https://rocketpresswire.com",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store, no-cache, must-revalidate",
}

type RequestBody = {
    website_url?: unknown
    title?: unknown
    summary?: unknown
    featured_image_url?: unknown
    content?: unknown
    categories?: unknown
    company?: unknown
    contact_name?: unknown
    contact_email?: unknown
    full_address?: unknown
    phone?: unknown
    seo_title?: unknown
    keywords?: unknown
    meta_description?: unknown
    source_document_path?: unknown
    source_document_name?: unknown
    source_document_mime_type?: unknown
    source_document_size_bytes?: unknown
}

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, { status, headers: corsHeaders })
}

type SupabaseErrorShape = {
    message?: string
    code?: string
    details?: string
    hint?: string
}

function databaseErrorResponse(stage: string, error: SupabaseErrorShape) {
    const diagnostic = {
        stage,
        message: error.message || "Unknown Supabase error",
        code: error.code || null,
        details: error.details || null,
        hint: error.hint || null,
    }

    console.error("[free-releases] Supabase error", diagnostic)

    return jsonResponse(
        {
            error: diagnostic.message,
            debug: diagnostic,
        },
        500
    )
}

function unexpectedErrorResponse(stage: string, error: unknown) {
    const candidate =
        typeof error === "object" && error !== null
            ? (error as SupabaseErrorShape)
            : {}

    return databaseErrorResponse(stage, {
        message:
            candidate.message ||
            (error instanceof Error ? error.message : String(error)),
        code: candidate.code,
        details: candidate.details,
        hint: candidate.hint,
    })
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

function stringArray(value: unknown) {
    if (!Array.isArray(value)) return null
    if (value.some((item) => typeof item !== "string")) return null

    return value.map((item) => item.trim()).filter(Boolean)
}

function buildFreeReleaseInsert(
    body: RequestBody,
    userEmail: string,
    userId: string
) {
    const websiteUrl = requiredString(body.website_url)
    const title = requiredString(body.title)
    const summary = requiredString(body.summary)
    const content = requiredString(body.content)
    const categories = stringArray(body.categories)
    const company = requiredString(body.company)
    const contactName = requiredString(body.contact_name)
    const contactEmail = requiredString(body.contact_email)
    const featuredImageUrl = optionalString(body.featured_image_url)
    const fullAddress = optionalString(body.full_address)
    const phone = optionalString(body.phone)
    const seoTitle = optionalString(body.seo_title)
    const keywords = optionalString(body.keywords)
    const metaDescription = optionalString(body.meta_description)
    const sourceDocumentMetadata = normalizeSourceDocumentMetadata(
        body,
        userId
    )

    if (
        !websiteUrl ||
        !title ||
        !summary ||
        !content ||
        !categories?.length ||
        !company ||
        !contactName ||
        !contactEmail ||
        featuredImageUrl === undefined ||
        fullAddress === undefined ||
        phone === undefined ||
        seoTitle === undefined ||
        keywords === undefined ||
        metaDescription === undefined ||
        !sourceDocumentMetadata
    ) {
        return null
    }

    return {
        user_email: userEmail,
        customer_name: contactName,
        customer_email: userEmail,
        website_url: websiteUrl,
        title,
        summary,
        featured_image_url: featuredImageUrl,
        content: sanitizePressReleaseHtml(content),
        categories,
        company,
        contact_name: contactName,
        contact_email: contactEmail,
        full_address: fullAddress,
        phone,
        seo_title: seoTitle,
        keywords,
        meta_description: metaDescription,
        ...sourceDocumentMetadata,
        writing_option: "own",
        status: "Submitted",
        admin_status: "Submitted",
    }
}

function normalizeFreeRelease(row: Record<string, any> | null) {
    if (!row) return null

    const firstMediaFile = Array.isArray(row.media_files)
        ? row.media_files[0]
        : null
    const legacyFeaturedImage =
        typeof firstMediaFile === "string"
            ? firstMediaFile
            : typeof firstMediaFile?.url === "string"
              ? firstMediaFile.url
              : null

    return {
        ...row,
        title: row.title ?? row.release_title ?? "",
        summary: row.summary ?? row.subtitle ?? null,
        website_url: row.website_url ?? null,
        featured_image_url:
            row.featured_image_url ?? legacyFeaturedImage ?? null,
        content: row.content ?? row.release_content ?? "",
        categories: Array.isArray(row.categories) ? row.categories : [],
        company: row.company ?? row.company_name ?? null,
        contact_name: row.contact_name ?? row.customer_name ?? null,
        contact_email: row.contact_email ?? row.customer_email ?? null,
        full_address: row.full_address ?? row.contact_information ?? null,
        phone: row.phone ?? null,
        seo_title: row.seo_title ?? null,
        keywords: row.keywords ?? null,
        meta_description: row.meta_description ?? null,
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
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle()

        if (error) {
            console.error("[free-releases] Failed to query free release", {
                userId: user.id,
                error: error.message,
            })
            return jsonResponse({ error: "Server error" }, 500)
        }

        return jsonResponse(
            { release: normalizeFreeRelease(data as Record<string, any> | null) },
            200
        )
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

        console.info("[free-releases] Authenticated user", {
            id: user.id,
            email: user.email ?? null,
        })

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
            return databaseErrorResponse(
                "check-existing-release",
                existingError
            )
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

        console.info("[free-releases] Incoming request payload", body)

        const insert = buildFreeReleaseInsert(body, userEmail, user.id)

        if (!insert) {
            return jsonResponse({ error: "Invalid body" }, 400)
        }

        // A retry protects sequential ID allocation when simultaneous requests
        // compete for the same release_id and the table's unique key rejects one.
        for (let attempt = 0; attempt < 5; attempt += 1) {
            let releaseId: string

            try {
                releaseId = await generateFreeReleaseId()
            } catch (error) {
                return unexpectedErrorResponse("generate-release-id", error)
            }
            const finalInsert = {
                release_id: releaseId,
                user_id: user.id,
                user_email: insert.user_email,
                website_url: insert.website_url,
                title: insert.title,
                summary: insert.summary,
                featured_image_url: insert.featured_image_url,
                content: insert.content,
                categories: insert.categories,
                contact_name: insert.contact_name,
                contact_email: insert.contact_email,
                seo_title: insert.seo_title,
                keywords: insert.keywords,
                meta_description: insert.meta_description,
                writing_option: "own",
                status: "Submitted",
                admin_status: "Submitted",
            }

            console.info(
                "[free-releases] Final Supabase insert object",
                finalInsert
            )

            const { data, error } = await supabaseAdmin
                .from("free_releases")
                .insert(finalInsert)
                .select("*")
                .single()

            if (!error) {
                return jsonResponse(
                    {
                        success: true,
                        release_id: releaseId,
                        release: normalizeFreeRelease(
                            data as Record<string, any>
                        ),
                    },
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

            return databaseErrorResponse("insert-free-release", error)
        }

        console.error("[free-releases] Exhausted release ID retries", {
            userId: user.id,
        })
        return jsonResponse({ error: "Server error" }, 500)
    } catch (error) {
        return unexpectedErrorResponse("free-release-post", error)
    }
}
