import {
    ADMIN_CORS_HEADERS,
    adminOptionsResponse,
} from "@/lib/admin-auth"
import {
    AdminAuthorizationError,
    requireActiveAdmin,
} from "@/lib/requireActiveAdmin"
import { sendFreeReleaseCompletionEmail } from "@/lib/customer-order-confirmation"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = {
    params: Promise<{ id?: string }>
}

type AllowedField = "status" | "admin_status" | "published_url" | "report_file"
type RequestBody = Partial<Record<AllowedField, unknown>> & Record<string, unknown>

const allowedFields: AllowedField[] = [
    "status",
    "admin_status",
    "published_url",
    "report_file",
]

type FreeReleaseEmailRow = {
    id: string
    status: string
    user_email: string | null
    customer_email: string | null
    contact_email: string | null
    customer_name: string | null
    contact_name: string | null
    release_id: string
    title: string | null
    release_title: string | null
    published_url: string | null
    report_file: string | null
}

const freeReleaseEmailFields = [
    "id",
    "status",
    "user_email",
    "customer_email",
    "contact_email",
    "customer_name",
    "contact_name",
    "release_id",
    "title",
    "release_title",
    "published_url",
    "report_file",
].join(",")

function normalizeStatus(value: unknown) {
    return typeof value === "string" ? value.trim().toLowerCase() : ""
}

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, { status, headers: ADMIN_CORS_HEADERS })
}

function buildUpdate(body: RequestBody) {
    if (Object.keys(body).some((field) => !allowedFields.includes(field as AllowedField))) {
        return null
    }

    const update: Record<string, string | null> = {}

    for (const field of allowedFields) {
        if (!Object.hasOwn(body, field)) continue

        const value = body[field]

        if (value !== null && typeof value !== "string") return null

        update[field] = typeof value === "string" ? value.trim() || null : null
    }

    if (Object.keys(update).length === 0) return null

    update.updated_at = new Date().toISOString()
    return update
}

export async function OPTIONS() {
    return adminOptionsResponse()
}

export async function PATCH(request: Request, context: RouteContext) {
    try {
        const activeAdmin = await requireActiveAdmin(request)
        const { id } = await context.params

        if (!id) {
            return jsonResponse({ error: "Missing release ID" }, 400)
        }

        let body: RequestBody

        try {
            body = (await request.json()) as RequestBody
        } catch {
            return jsonResponse({ error: "Invalid body" }, 400)
        }

        const update = buildUpdate(body)

        if (!update) {
            return jsonResponse({ error: "Invalid body" }, 400)
        }

        const { data: currentRelease, error: currentReleaseError } =
            await supabaseAdmin
                .from("free_releases")
                .select(freeReleaseEmailFields)
                .eq("id", id)
                .maybeSingle<FreeReleaseEmailRow>()

        if (currentReleaseError) {
            console.error(
                "[admin-free-release-update] Failed to load current release",
                {
                    adminEmail: activeAdmin.email,
                    releaseId: id,
                    error: currentReleaseError.message,
                }
            )
            return jsonResponse({ error: "Server error" }, 500)
        }

        if (!currentRelease) {
            return jsonResponse({ error: "Release not found" }, 404)
        }

        const transitionedToCompleted =
            normalizeStatus(currentRelease.status) !== "completed" &&
            normalizeStatus(update.status) === "completed"
        let shouldSendCompletionEmail = transitionedToCompleted

        const updateRequest = transitionedToCompleted
            ? supabaseAdmin
                  .from("free_releases")
                  .update(update)
                  .eq("id", id)
                  .eq("status", currentRelease.status)
            : supabaseAdmin
                  .from("free_releases")
                  .update(update)
                  .eq("id", id)

        let { data, error } = await updateRequest
            .select("*")
            .maybeSingle()

        // If two completion requests race, only the compare-and-set winner sends
        // the email. Apply the latest request once more without sending a duplicate.
        if (transitionedToCompleted && !error && !data) {
            shouldSendCompletionEmail = false
            const retryResult = await supabaseAdmin
                .from("free_releases")
                .update(update)
                .eq("id", id)
                .select("*")
                .maybeSingle()

            data = retryResult.data
            error = retryResult.error
        }

        if (error) {
            console.error("[admin-free-release-update] Failed to update release", {
                adminEmail: activeAdmin.email,
                releaseId: id,
                error: error.message,
            })
            return jsonResponse({ error: "Server error" }, 500)
        }

        if (!data) {
            return jsonResponse({ error: "Release not found" }, 404)
        }

        if (shouldSendCompletionEmail) {
            const completedRelease = data as FreeReleaseEmailRow
            const customerEmail =
                completedRelease.user_email ||
                completedRelease.contact_email ||
                completedRelease.customer_email

            if (!customerEmail) {
                console.error(
                    "[admin-free-release-update] Completion email skipped: customer email is missing",
                    {
                        adminEmail: activeAdmin.email,
                        releaseId: completedRelease.release_id,
                    }
                )
            } else {
                try {
                    await sendFreeReleaseCompletionEmail({
                        customerName:
                            completedRelease.customer_name ||
                            completedRelease.contact_name,
                        customerEmail,
                        releaseId: completedRelease.release_id,
                        releaseTitle:
                            completedRelease.title ||
                            completedRelease.release_title ||
                            "Untitled Release",
                        publishedUrl: completedRelease.published_url,
                        reportFile: completedRelease.report_file,
                    })
                } catch (emailError) {
                    // Match the existing completion flow: the status update remains
                    // successful even when the notification provider is unavailable.
                    console.error(
                        "[admin-free-release-update] Completion email failed after release update",
                        {
                            adminEmail: activeAdmin.email,
                            releaseId: completedRelease.release_id,
                            error:
                                emailError instanceof Error
                                    ? emailError.message
                                    : "Unknown error",
                        }
                    )
                }
            }
        }

        return jsonResponse({ success: true, release: data }, 200)
    } catch (error) {
        if (error instanceof AdminAuthorizationError) {
            return jsonResponse({ error: error.message }, error.status)
        }

        console.error("[admin-free-release-update] Server error", {
            error: error instanceof Error ? error.message : "Unknown error",
        })
        return jsonResponse({ error: "Server error" }, 500)
    }
}
