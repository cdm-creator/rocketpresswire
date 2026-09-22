import {
    generateReleaseEmailCode,
    generateReleaseEmailCodeSalt,
    hashReleaseEmailCode,
    RELEASE_EMAIL_CODE_TTL_MINUTES,
    RELEASE_EMAIL_MAX_SENDS_PER_HOUR,
    RELEASE_EMAIL_MAX_VERIFY_ATTEMPTS,
    RELEASE_EMAIL_RESEND_SECONDS,
    releaseEmailCodeMatches,
    type ReleaseEmailFlow,
    validateReleaseContactEmail,
} from "@/lib/release-contact-email"
import { sendReleaseEmailVerificationCode } from "@/lib/release-email-verification-email"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = {
    "Access-Control-Allow-Origin": "https://rocketpresswire.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store, no-cache, must-revalidate",
}

type VerificationRow = {
    id: string
    user_id: string
    release_type: ReleaseEmailFlow
    email: string
    code_hash: string | null
    code_salt: string | null
    code_expires_at: string | null
    verified_at: string | null
    consumed_at: string | null
    last_sent_at: string
    send_window_started_at: string
    send_count: number
    failed_attempts: number
}

function jsonResponse(body: unknown, status: number) {
    return Response.json(body, { status, headers: corsHeaders })
}

function getBearerToken(request: Request) {
    const authorization = request.headers.get("authorization")
    if (!authorization) return null

    const [scheme, token] = authorization.split(" ")
    return scheme?.toLowerCase() === "bearer" && token?.trim()
        ? token.trim()
        : null
}

function normalizeFlow(value: unknown): ReleaseEmailFlow | null {
    return value === "free" || value === "paid" ? value : null
}

async function getUser(request: Request) {
    const token = getBearerToken(request)
    if (!token) return null

    const { data, error } = await supabaseAdmin.auth.getUser(token)
    return error ? null : data.user
}

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: corsHeaders })
}

export async function POST(request: Request) {
    try {
        const user = await getUser(request)

        if (!user) {
            return jsonResponse({ error: "Unauthorized" }, 401)
        }

        const body = (await request.json().catch(() => null)) as Record<
            string,
            unknown
        > | null
        const action = body?.action
        const flow = normalizeFlow(body?.release_type)

        if (!flow) {
            return jsonResponse({ error: "Invalid release type." }, 400)
        }

        if (action === "invalidate") {
            const invalidatedAt = new Date().toISOString()
            const { error } = await supabaseAdmin
                .from("release_email_verifications")
                .update({
                    code_hash: null,
                    code_salt: null,
                    code_expires_at: null,
                    verified_at: null,
                    consumed_at: invalidatedAt,
                    updated_at: invalidatedAt,
                })
                .eq("user_id", user.id)
                .eq("release_type", flow)

            if (error) throw error

            return jsonResponse({ invalidated: true }, 200)
        }

        const validation = validateReleaseContactEmail(body?.email, flow)

        if (validation.error) {
            return jsonResponse({ error: validation.error }, 400)
        }

        if (action === "send") {
            return await sendCode(user.id, flow, validation.email)
        }

        if (action === "verify") {
            return await verifyCode(
                user.id,
                flow,
                validation.email,
                body?.code
            )
        }

        return jsonResponse({ error: "Invalid action." }, 400)
    } catch (error) {
        console.error("[release-email-verification] Request failed", {
            error: error instanceof Error ? error.message : String(error),
        })
        return jsonResponse({ error: "Unable to verify email right now." }, 500)
    }
}

async function sendCode(
    userId: string,
    flow: ReleaseEmailFlow,
    email: string
) {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const { data: current, error: readError } = await supabaseAdmin
        .from("release_email_verifications")
        .select("*")
        .eq("user_id", userId)
        .eq("release_type", flow)
        .maybeSingle<VerificationRow>()

    if (readError) throw readError

    if (current?.verified_at && !current.consumed_at && current.email === email) {
        return jsonResponse({ verified: true, email }, 200)
    }

    if (current) {
        const lastSentAt = new Date(current.last_sent_at)
        const retryAt = new Date(
            lastSentAt.getTime() + RELEASE_EMAIL_RESEND_SECONDS * 1000
        )

        if (retryAt > now) {
            return jsonResponse(
                {
                    error: `Please wait ${Math.ceil((retryAt.getTime() - now.getTime()) / 1000)} seconds before requesting another code.`,
                    retry_after_seconds: Math.ceil(
                        (retryAt.getTime() - now.getTime()) / 1000
                    ),
                },
                429
            )
        }

        const windowStartedAt = new Date(current.send_window_started_at)

        if (
            windowStartedAt > oneHourAgo &&
            current.send_count >= RELEASE_EMAIL_MAX_SENDS_PER_HOUR
        ) {
            return jsonResponse(
                { error: "Too many verification codes requested. Please try again later." },
                429
            )
        }
    }

    const code = generateReleaseEmailCode()
    const salt = generateReleaseEmailCodeSalt()
    const codeExpiresAt = new Date(
        now.getTime() + RELEASE_EMAIL_CODE_TTL_MINUTES * 60 * 1000
    )
    const keepWindow =
        current && new Date(current.send_window_started_at) > oneHourAgo

    const record = {
        user_id: userId,
        release_type: flow,
        email,
        code_hash: hashReleaseEmailCode(code, salt),
        code_salt: salt,
        code_expires_at: codeExpiresAt.toISOString(),
        verified_at: null,
        consumed_at: null,
        last_sent_at: now.toISOString(),
        send_window_started_at: keepWindow
            ? current.send_window_started_at
            : now.toISOString(),
        send_count: keepWindow ? current.send_count + 1 : 1,
        failed_attempts: 0,
        updated_at: now.toISOString(),
    }

    const { error: writeError } = await supabaseAdmin
        .from("release_email_verifications")
        .upsert(record, { onConflict: "user_id,release_type" })

    if (writeError) throw writeError

    try {
        await sendReleaseEmailVerificationCode(email, code)
    } catch (error) {
        await supabaseAdmin
            .from("release_email_verifications")
            .delete()
            .eq("user_id", userId)
            .eq("release_type", flow)
            .eq("code_hash", record.code_hash)
        throw error
    }

    return jsonResponse(
        {
            sent: true,
            expires_in_seconds: RELEASE_EMAIL_CODE_TTL_MINUTES * 60,
            resend_after_seconds: RELEASE_EMAIL_RESEND_SECONDS,
        },
        200
    )
}

async function verifyCode(
    userId: string,
    flow: ReleaseEmailFlow,
    email: string,
    codeValue: unknown
) {
    const code = typeof codeValue === "string" ? codeValue.trim() : ""

    if (!/^\d{6}$/.test(code)) {
        return jsonResponse({ error: "Enter the 6-digit verification code." }, 400)
    }

    const { data: current, error: readError } = await supabaseAdmin
        .from("release_email_verifications")
        .select("*")
        .eq("user_id", userId)
        .eq("release_type", flow)
        .eq("email", email)
        .maybeSingle<VerificationRow>()

    if (readError) throw readError

    if (
        !current ||
        !current.code_hash ||
        !current.code_salt ||
        !current.code_expires_at ||
        current.consumed_at
    ) {
        return jsonResponse({ error: "Request a new verification code." }, 400)
    }

    if (current.failed_attempts >= RELEASE_EMAIL_MAX_VERIFY_ATTEMPTS) {
        return jsonResponse(
            { error: "Too many incorrect attempts. Request a new code." },
            429
        )
    }

    if (new Date(current.code_expires_at) <= new Date()) {
        return jsonResponse(
            { error: "This verification code has expired. Request a new code." },
            400
        )
    }

    if (!releaseEmailCodeMatches(code, current.code_salt, current.code_hash)) {
        await supabaseAdmin
            .from("release_email_verifications")
            .update({
                failed_attempts: current.failed_attempts + 1,
                updated_at: new Date().toISOString(),
            })
            .eq("id", current.id)

        return jsonResponse({ error: "The verification code is incorrect." }, 400)
    }

    const verifiedAt = new Date().toISOString()
    const { data: updatedVerification, error: updateError } = await supabaseAdmin
        .from("release_email_verifications")
        .update({
            verified_at: verifiedAt,
            code_hash: null,
            code_salt: null,
            code_expires_at: null,
            failed_attempts: 0,
            updated_at: verifiedAt,
        })
        .eq("id", current.id)
        .is("consumed_at", null)
        .select("id")
        .maybeSingle()

    if (updateError) throw updateError

    if (!updatedVerification) {
        return jsonResponse({ error: "Request a new verification code." }, 400)
    }

    return jsonResponse({ verified: true, email }, 200)
}
