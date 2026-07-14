import {
    addDaysToBusinessDate,
    businessDateToUtcNoonISOString,
    normalizeToBusinessDate,
} from "@/lib/businessDate"
import { PRODUCT_NAME_MAP, PRODUCT_PRICE_MAP } from "@/lib/products"

export type DeliveryEstimate = {
    deliveryText: string
    expectedDays: number
}

export type ProductDeliveryConfig = {
    canonicalName: string
    slug: string
    aliases: string[]
    stripePriceIds: string[]
    thriveCartProductIds: string[]
    deliveryText: string | null
    expectedDays: number | null
}

export type ProductDeliveryLookup = {
    productId?: string | null
    productName?: string | null
    slug?: string | null
    externalId?: string | null
    stripePriceId?: string | null
}

const DELIVERY_ESTIMATE_PATTERN =
    /^(\d+)(?:(?:\s*(?:-|\u2013|\u2014)\s*|\s+to\s+)(\d+))?\s*(?:(?:business\s+)?days?|d)(?:\s+[a-z][a-z\s]*)?$/i

export const PRODUCT_DELIVERY_CONFIG = [
    {
        canonicalName: PRODUCT_NAME_MAP.msn,
        slug: "msn",
        aliases: ["MSN", "msn"],
        stripePriceIds: [PRODUCT_PRICE_MAP.msn],
        thriveCartProductIds: [],
        deliveryText: "5 Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.reuters,
        slug: "reuters",
        aliases: ["Reuters", "reuters"],
        stripePriceIds: [PRODUCT_PRICE_MAP.reuters],
        thriveCartProductIds: [],
        deliveryText: "7 Days",
        expectedDays: 7,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.openPR,
        slug: "openPR",
        aliases: ["OpenPR", "Open PR", "openPR", "openpr", "open-pr"],
        stripePriceIds: [PRODUCT_PRICE_MAP.openPR],
        thriveCartProductIds: [],
        deliveryText: "2 Days",
        expectedDays: 2,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.core,
        slug: "core",
        aliases: ["Core", "core"],
        stripePriceIds: [PRODUCT_PRICE_MAP.core],
        thriveCartProductIds: [],
        deliveryText: "5-7 Days Publishing",
        expectedDays: 7,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.growth,
        slug: "growth",
        aliases: ["Growth", "growth", "product_4"],
        stripePriceIds: [PRODUCT_PRICE_MAP.growth],
        thriveCartProductIds: ["product_4"],
        deliveryText: "5-7 Days Publishing",
        expectedDays: 7,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.premium,
        slug: "premium",
        aliases: ["Premium", "premium"],
        stripePriceIds: [PRODUCT_PRICE_MAP.premium],
        thriveCartProductIds: [],
        deliveryText: "5-7 Days Publishing",
        expectedDays: 7,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.enterprise,
        slug: "enterprise",
        aliases: ["Enterprise", "enterprise"],
        stripePriceIds: [PRODUCT_PRICE_MAP.enterprise],
        thriveCartProductIds: [],
        deliveryText: "5-7 Days Publishing",
        expectedDays: 7,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.morningstar,
        slug: "morningstar",
        aliases: ["Morningstar", "morningstar"],
        stripePriceIds: [PRODUCT_PRICE_MAP.morningstar],
        thriveCartProductIds: [],
        deliveryText: null,
        expectedDays: null,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.apple_news,
        slug: "apple_news",
        aliases: ["Apple News", "apple_news", "apple-news"],
        stripePriceIds: [PRODUCT_PRICE_MAP.apple_news],
        thriveCartProductIds: [],
        deliveryText: null,
        expectedDays: null,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.big_news_network,
        slug: "big_news_network",
        aliases: ["Big News Network", "big_news_network", "big-news-network"],
        stripePriceIds: [PRODUCT_PRICE_MAP.big_news_network],
        thriveCartProductIds: [],
        deliveryText: null,
        expectedDays: null,
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

export function normalizeDeliveryEstimate(value: unknown): DeliveryEstimate | null {
    if (typeof value !== "string") {
        return null
    }

    const match = value.trim().match(DELIVERY_ESTIMATE_PATTERN)

    if (!match) {
        return null
    }

    const startDays = Number(match[1])
    const endDays = match[2] ? Number(match[2]) : startDays

    if (
        !Number.isInteger(startDays) ||
        !Number.isInteger(endDays) ||
        !Number.isSafeInteger(startDays) ||
        !Number.isSafeInteger(endDays) ||
        startDays <= 0 ||
        endDays <= 0 ||
        startDays > endDays
    ) {
        return null
    }

    return {
        deliveryText:
            startDays === endDays
                ? `${endDays} ${endDays === 1 ? "Day" : "Days"}`
                : `${startDays}-${endDays} Days`,
        expectedDays: endDays,
    }
}

export function addExpectedDays(
    createdAt: string | Date,
    expectedDays: number | null
) {
    if (expectedDays === null) {
        return null
    }

    const createdDate =
        createdAt instanceof Date ? createdAt : new Date(createdAt)

    if (Number.isNaN(createdDate.getTime())) {
        return null
    }

    const createdBusinessDate = normalizeToBusinessDate(createdDate.toISOString())

    const expectedBusinessDate = createdBusinessDate
        ? addDaysToBusinessDate(createdBusinessDate, expectedDays)
        : null

    return expectedBusinessDate
        ? businessDateToUtcNoonISOString(expectedBusinessDate)
        : null
}

export function getProductDeliveryBySlug(slug: ProductSlug) {
    return PRODUCT_DELIVERY_CONFIG.find((entry) => entry.slug === slug) ?? null
}
