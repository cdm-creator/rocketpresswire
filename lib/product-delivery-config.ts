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
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.reuters,
        slug: "reuters",
        aliases: ["Reuters", "reuters"],
        stripePriceIds: [PRODUCT_PRICE_MAP.reuters],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.core,
        slug: "core",
        aliases: ["Core", "core"],
        stripePriceIds: [PRODUCT_PRICE_MAP.core],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.growth,
        slug: "growth",
        aliases: ["Growth", "growth", "product_4"],
        stripePriceIds: [PRODUCT_PRICE_MAP.growth],
        thriveCartProductIds: ["product_4"],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.premium,
        slug: "premium",
        aliases: ["Premium", "premium"],
        stripePriceIds: [PRODUCT_PRICE_MAP.premium],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.enterprise,
        slug: "enterprise",
        aliases: ["Enterprise", "enterprise"],
        stripePriceIds: [PRODUCT_PRICE_MAP.enterprise],
        thriveCartProductIds: [],
        deliveryText: "7 Business Days",
        expectedDays: 7,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.morningstar,
        slug: "morningstar",
        aliases: ["Morningstar", "morningstar"],
        stripePriceIds: [PRODUCT_PRICE_MAP.morningstar],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.apple_news,
        slug: "apple_news",
        aliases: ["Apple News", "apple_news", "apple-news"],
        stripePriceIds: [PRODUCT_PRICE_MAP.apple_news],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.big_news_network,
        slug: "big_news_network",
        aliases: ["Big News Network", "big_news_network", "big-news-network"],
        stripePriceIds: [PRODUCT_PRICE_MAP.big_news_network],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.usa_today,
        slug: "usa_today",
        aliases: ["USA Today", "usa_today", "usa-today"],
        stripePriceIds: [PRODUCT_PRICE_MAP.usa_today],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.benzinga,
        slug: "benzinga",
        aliases: ["Benzinga", "benzinga"],
        stripePriceIds: [PRODUCT_PRICE_MAP.benzinga],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.associated_press,
        slug: "associated_press",
        aliases: ["Associated Press", "associated_press", "associated-press"],
        stripePriceIds: [PRODUCT_PRICE_MAP.associated_press],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.business_insider,
        slug: "business_insider",
        aliases: ["Business Insider", "business_insider", "business-insider"],
        stripePriceIds: [PRODUCT_PRICE_MAP.business_insider],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.barchart,
        slug: "barchart",
        aliases: ["Barchart", "barchart"],
        stripePriceIds: [PRODUCT_PRICE_MAP.barchart],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.yahoo_finance,
        slug: "yahoo_finance",
        aliases: ["Yahoo Finance", "yahoo_finance", "yahoo-finance"],
        stripePriceIds: [PRODUCT_PRICE_MAP.yahoo_finance],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.ai_journal,
        slug: "ai_journal",
        aliases: ["AI Journal", "ai_journal", "ai-journal"],
        stripePriceIds: [PRODUCT_PRICE_MAP.ai_journal],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.techbullion,
        slug: "techbullion",
        aliases: ["TechBullion", "Tech Bullion", "techbullion"],
        stripePriceIds: [PRODUCT_PRICE_MAP.techbullion],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.hackernoon,
        slug: "hackernoon",
        aliases: ["HackerNoon", "Hacker Noon", "hackernoon"],
        stripePriceIds: [PRODUCT_PRICE_MAP.hackernoon],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
    },
    {
        canonicalName: PRODUCT_NAME_MAP.dummy,
        slug: "dummy",
        aliases: ["Dummy", "dummy"],
        stripePriceIds: [PRODUCT_PRICE_MAP.dummy],
        thriveCartProductIds: [],
        deliveryText: "5 Business Days",
        expectedDays: 5,
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
                ? `${endDays} Business ${endDays === 1 ? "Day" : "Days"}`
                : `${startDays}-${endDays} Business Days`,
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

export function buildCanonicalDeliveryByProduct(
    productIds: readonly ProductSlug[]
) {
    return Object.fromEntries(
        productIds.map((productId) => {
            const deliveryConfig = getProductDeliveryBySlug(productId)

            if (!deliveryConfig?.deliveryText) {
                throw new Error("Missing authoritative delivery configuration.")
            }

            return [productId, deliveryConfig.deliveryText]
        })
    ) as Record<ProductSlug, string>
}
