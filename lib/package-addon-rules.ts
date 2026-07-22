import {
    PACKAGE_IDS,
    type ProductId,
} from "@/lib/products"

export type PackageId = (typeof PACKAGE_IDS)[number]

export const PACKAGE_OUTLET_COMPATIBILITY = {
    core: [
        "usa_today",
        "benzinga",
        "associated_press",
        "business_insider",
        "barchart",
        "yahoo_finance",
        "msn",
        "ai_journal",
        "morningstar",
        "reuters",
        "big_news_network",
        "apple_news",
        "techbullion",
        "hackernoon",
    ],
    growth: [
        "business_insider",
        "barchart",
        "yahoo_finance",
        "msn",
        "ai_journal",
        "morningstar",
        "reuters",
        "big_news_network",
        "apple_news",
        "techbullion",
        "hackernoon",
    ],
    premium: [
        "yahoo_finance",
        "msn",
        "ai_journal",
        "morningstar",
        "reuters",
        "big_news_network",
        "apple_news",
        "techbullion",
        "hackernoon",
    ],
    enterprise: [
        "morningstar",
        "reuters",
        "big_news_network",
        "apple_news",
        "techbullion",
        "hackernoon",
    ],
} as const satisfies Record<PackageId, readonly ProductId[]>

const PACKAGE_ID_SET = new Set<string>(PACKAGE_IDS)

export function isPackageId(productId: ProductId): productId is PackageId {
    return PACKAGE_ID_SET.has(productId)
}

export type PackageSelectionValidation =
    | { valid: true; packageId: PackageId | null }
    | { valid: false; reason: "multiple_packages" | "incompatible_outlet" }

export function validatePackageSelection(
    productIds: readonly ProductId[]
): PackageSelectionValidation {
    const selectedPackages = productIds.filter(isPackageId)

    if (selectedPackages.length > 1) {
        return { valid: false, reason: "multiple_packages" }
    }

    const packageId = selectedPackages[0] ?? null

    if (!packageId) {
        return { valid: true, packageId: null }
    }

    const allowedOutlets = new Set<string>(
        PACKAGE_OUTLET_COMPATIBILITY[packageId]
    )
    const hasIncompatibleOutlet = productIds.some(
        (productId) => productId !== packageId && !allowedOutlets.has(productId)
    )

    return hasIncompatibleOutlet
        ? { valid: false, reason: "incompatible_outlet" }
        : { valid: true, packageId }
}
