import sanitizeHtml from "sanitize-html"

export const PRESS_RELEASE_MIN_WORDS = 400
export const PRESS_RELEASE_MAX_WORDS = 1000

export function countPressReleaseWords(value: unknown): number {
    if (typeof value !== "string" || !value.trim()) {
        return 0
    }

    const safeHtml = sanitizeHtml(value)
    const tagSeparatedText = safeHtml.replace(/<[^>]*>/g, " ")
    const readableText = sanitizeHtml(tagSeparatedText, {
        allowedTags: [],
        allowedAttributes: {},
    })

    return readableText
        .trim()
        .split(/\s+/)
        .filter((word) => /[\p{L}\p{N}]/u.test(word)).length
}

export function getPressReleaseWordError(value: unknown): string | null {
    const wordCount = countPressReleaseWords(value)

    if (wordCount < PRESS_RELEASE_MIN_WORDS) {
        return "Content must contain at least 400 words."
    }

    if (wordCount > PRESS_RELEASE_MAX_WORDS) {
        return "Content must contain no more than 1,000 words."
    }

    return null
}
