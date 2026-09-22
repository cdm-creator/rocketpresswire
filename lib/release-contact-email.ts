import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto"

import { supabaseAdmin } from "@/lib/supabase-admin"

export type ReleaseEmailFlow = "free" | "paid"

const PERSONAL_EMAIL_DOMAINS = new Set([
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "aol.com",
    "icloud.com",
    "mail.com",
    "protonmail.com",
    "zoho.com",
])

export const RELEASE_EMAIL_CODE_TTL_MINUTES = 10
export const RELEASE_EMAIL_RESEND_SECONDS = 60
export const RELEASE_EMAIL_MAX_SENDS_PER_HOUR = 5
export const RELEASE_EMAIL_MAX_VERIFY_ATTEMPTS = 5

export function normalizeReleaseContactEmail(value: unknown) {
    return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export function isValidReleaseContactEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isPersonalFreeReleaseEmail(value: string) {
    const domain = normalizeReleaseContactEmail(value).split("@")[1]
    return Boolean(domain && PERSONAL_EMAIL_DOMAINS.has(domain))
}

export function validateReleaseContactEmail(
    value: unknown,
    flow: ReleaseEmailFlow
) {
    const email = normalizeReleaseContactEmail(value)

    if (!isValidReleaseContactEmail(email)) {
        return { email, error: "Please enter a valid email address." }
    }

    if (flow === "free" && isPersonalFreeReleaseEmail(email)) {
        return { email, error: "Please enter a business email only." }
    }

    return { email, error: null }
}

export function generateReleaseEmailCode() {
    return randomInt(100000, 1000000).toString()
}

export function generateReleaseEmailCodeSalt() {
    return randomBytes(16).toString("hex")
}

export function hashReleaseEmailCode(code: string, salt: string) {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!secret) {
        throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY")
    }

    return createHash("sha256")
        .update(`${secret}:${salt}:${code}`)
        .digest("hex")
}

export function releaseEmailCodeMatches(
    code: string,
    salt: string,
    expectedHash: string
) {
    const actual = Buffer.from(hashReleaseEmailCode(code, salt), "hex")
    const expected = Buffer.from(expectedHash, "hex")

    return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function consumeReleaseEmailVerification(
    userId: string,
    flow: ReleaseEmailFlow,
    email: string
) {
    const { data, error } = await supabaseAdmin
        .from("release_email_verifications")
        .update({ consumed_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("release_type", flow)
        .eq("email", normalizeReleaseContactEmail(email))
        .not("verified_at", "is", null)
        .is("consumed_at", null)
        .select("id")
        .maybeSingle()

    if (error) {
        console.error("[release-email-verification] Consume failed", {
            userId,
            flow,
            error: error.message,
        })
        throw new Error("Unable to verify email ownership right now.")
    }

    return Boolean(data)
}
