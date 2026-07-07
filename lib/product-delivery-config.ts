export type ProductDeliveryConfig = {
    canonicalName: string
    slug: string
    aliases: string[]
    stripePriceIds: string[]
    thriveCartProductIds: string[]
    deliveryText: string
    expectedDays: number
}

export type ProductDeliveryLookup = {
    productId?: string | null
    productName?: string | null
    slug?: string | null
    externalId?: string | null
    stripePriceId?: string | null
}

export const PRODUCT_DELIVERY_CONFIG = [
    {
        canonicalName: "MSN",
        slug: "msn",
        aliases: ["MSN", "msn"],
        stripePriceIds: ["price_1Tq8bFRvo61AD2cgV6by04aS"],
        thriveCartProductIds: [],
        deliveryText: "5 Days",
        expectedDays: 5,
    },
    {
        canonicalName: "Reuters",
        slug: "reuters",
        aliases: ["Reuters", "reuters"],
        stripePriceIds: ["price_1Tq8cPRvo61AD2cgeWCTcRyd"],
        thriveCartProductIds: [],
        deliveryText: "7 Days",
        expectedDays: 7,
    },
    {
        canonicalName: "OpenPR",
        slug: "openPR",
        aliases: ["OpenPR", "Open PR", "openPR", "openpr", "open-pr"],
        stripePriceIds: ["price_1Tq8csRvo61AD2cgaOaDm646"],
        thriveCartProductIds: [],
        deliveryText: "2 Days",
        expectedDays: 2,
    },
    {
        canonicalName: "Core",
        slug: "core",
        aliases: ["Core", "core"],
        stripePriceIds: [],
        thriveCartProductIds: [],
        deliveryText: "5-7 Days Publishing",
        expectedDays: 7,
    },
    {
        canonicalName: "Growth",
        slug: "growth",
        aliases: ["Growth", "growth", "product_4"],
        stripePriceIds: [],
        thriveCartProductIds: ["product_4"],
        deliveryText: "5-7 Days Publishing",
        expectedDays: 7,
    },
    {
        canonicalName: "Premium",
        slug: "premium",
        aliases: ["Premium", "premium"],
        stripePriceIds: [],
        thriveCartProductIds: [],
        deliveryText: "5-7 Days Publishing",
        expectedDays: 7,
    },
    {
        canonicalName: "Enterprise",
        slug: "enterprise",
        aliases: ["Enterprise", "enterprise"],
        stripePriceIds: [],
        thriveCartProductIds: [],
        deliveryText: "5-7 Days Publishing",
        expectedDays: 7,
    },
] as const satisfies ProductDeliveryConfig[]

export type ProductSlug = (typeof PRODUCT_DELIVERY_CONFIG)[number]["slug"]

function normalizeLookupValue(value: string | null | undefined) {
    return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? ""
}

function normalizeCompactValue(value: string | null | undefined) {
    return normalizeLookupValue(value).replace(/[^a-z0-9]/g, "")
}

function getLookupCandidates(input: ProductDeliveryLookup) {
    return [
        input.productId,
        input.productName,
        input.slug,
        input.externalId,
        input.stripePriceId,
    ].filter((value): value is string => Boolean(value?.trim()))
}

function entryMatches(entry: ProductDeliveryConfig, value: string) {
    const normalizedValue = normalizeLookupValue(value)
    const compactValue = normalizeCompactValue(value)
    const exactValues = [
        entry.slug,
        entry.canonicalName,
        ...entry.aliases,
        ...entry.thriveCartProductIds,
        ...entry.stripePriceIds,
    ]

    return exactValues.some(
        (candidate) =>
            normalizeLookupValue(candidate) === normalizedValue ||
            normalizeCompactValue(candidate) === compactValue
    )
}

export function resolveProductDelivery(input: ProductDeliveryLookup) {
    const candidates = getLookupCandidates(input)

    for (const candidate of candidates) {
        const exactProductIdMatch = PRODUCT_DELIVERY_CONFIG.find((entry) =>
            [...entry.thriveCartProductIds, ...entry.stripePriceIds, entry.slug].some(
                (id) => normalizeLookupValue(id) === normalizeLookupValue(candidate)
            )
        )

        if (exactProductIdMatch) {
            return exactProductIdMatch
        }
    }

    for (const candidate of candidates) {
        const exactNameMatch = PRODUCT_DELIVERY_CONFIG.find(
            (entry) =>
                normalizeLookupValue(entry.canonicalName) ===
                normalizeLookupValue(candidate)
        )

        if (exactNameMatch) {
            return exactNameMatch
        }
    }

    for (const candidate of candidates) {
        const aliasMatch = PRODUCT_DELIVERY_CONFIG.find((entry) =>
            entryMatches(entry, candidate)
        )

        if (aliasMatch) {
            return aliasMatch
        }
    }

    return null
}

export function addExpectedDays(createdAt: string | Date, expectedDays: number) {
    const createdDate =
        createdAt instanceof Date ? createdAt : new Date(createdAt)

    if (Number.isNaN(createdDate.getTime())) {
        return null
    }

    return new Date(
        createdDate.getTime() + expectedDays * 24 * 60 * 60 * 1000
    ).toISOString()
}

export function getProductDeliveryBySlug(slug: ProductSlug) {
    return PRODUCT_DELIVERY_CONFIG.find((entry) => entry.slug === slug) ?? null
}
