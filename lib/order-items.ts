export function calculateExpectedCompletionAt(deliveryText: string | null | undefined) {
    if (!deliveryText) {
        return null
    }

    const dayMatch = deliveryText.match(/\d+/)

    if (!dayMatch) {
        return null
    }

    const days = Number(dayMatch[0])

    if (!Number.isFinite(days)) {
        return null
    }

    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}
