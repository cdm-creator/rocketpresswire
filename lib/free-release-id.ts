import { supabaseAdmin } from "@/lib/supabase-admin"

const FREE_RELEASE_ID_PREFIX = "FR-"
const FREE_RELEASE_ID_WIDTH = 6
const FREE_RELEASE_ID_PATTERN = /^FR-(\d{6,})$/

export async function generateFreeReleaseId() {
    const { data, error } = await supabaseAdmin
        .from("free_releases")
        .select("release_id")
        .like("release_id", `${FREE_RELEASE_ID_PREFIX}%`)
        .order("release_id", { ascending: false })
        .limit(1)

    if (error) {
        throw error
    }

    const latestReleaseId = data?.[0]?.release_id
    const match =
        typeof latestReleaseId === "string"
            ? FREE_RELEASE_ID_PATTERN.exec(latestReleaseId)
            : null
    let nextNumber = match ? Number(match[1]) + 1 : 1

    while (Number.isSafeInteger(nextNumber)) {
        const releaseId = `${FREE_RELEASE_ID_PREFIX}${String(nextNumber).padStart(
            FREE_RELEASE_ID_WIDTH,
            "0"
        )}`
        const { data: existingRelease, error: lookupError } = await supabaseAdmin
            .from("free_releases")
            .select("id")
            .eq("release_id", releaseId)
            .maybeSingle()

        if (lookupError) {
            throw lookupError
        }

        if (!existingRelease) {
            return releaseId
        }

        nextNumber += 1
    }

    throw new Error("Unable to generate a free release ID")
}
