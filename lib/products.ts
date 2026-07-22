export const PACKAGE_IDS = ["core", "growth", "premium", "enterprise"] as const

export const COVERAGE_BOOST_IDS = ["morningstar", "apple_news", "big_news_network"] as const

export const DISTRIBUTION_PRODUCT_IDS = [
  "usa_today", "benzinga", "associated_press", "business_insider", "barchart",
  "yahoo_finance", "msn", "ai_journal", "reuters", "techbullion", "hackernoon",
] as const

export const PRODUCT_IDS = [...PACKAGE_IDS, ...COVERAGE_BOOST_IDS, ...DISTRIBUTION_PRODUCT_IDS] as const
export type ProductId = (typeof PRODUCT_IDS)[number]

export const PRODUCT_PRICE_MAP = {
  core: "price_1TvrfsIgy8kc6qIKL4GYYyBe",
  growth: "price_1TvrgVIgy8kc6qIKL0RJsNzN",
  premium: "price_1TvrhDIgy8kc6qIKRp7ueJc4",
  enterprise: "price_1Tvrn0Igy8kc6qIKoIh7O751",
  morningstar: "price_1Tvry9Igy8kc6qIKErPoVdRE",
  apple_news: "price_1Tvs0PIgy8kc6qIKxmGD7ZsO",
  big_news_network: "price_1TvrzxIgy8kc6qIKub5dBbaX",
  usa_today: "price_1TvrnhIgy8kc6qIKDocozhpV",
  benzinga: "price_1TvroPIgy8kc6qIKVVU0qssc",
  associated_press: "price_1Tvrp8Igy8kc6qIKC5Vc6xzi",
  business_insider: "price_1TvrpjIgy8kc6qIKc6JLVHVx",
  barchart: "price_1TvruPIgy8kc6qIKJE5JDT7q",
  yahoo_finance: "price_1Tvrv4Igy8kc6qIKR2zQt76t",
  msn: "price_1Tvrx3Igy8kc6qIKeudaQpmx",
  ai_journal: "price_1TvrxhIgy8kc6qIKFsuRn8L4",
  reuters: "price_1TvrzPIgy8kc6qIKzelV6teu",
  techbullion: "price_1Tvs10Igy8kc6qIKToEhzkAt",
  hackernoon: "price_1Tvs1UIgy8kc6qIKBdhxeDw4",
} as const satisfies Record<ProductId, string>

export const PRODUCT_NAME_MAP = {
  core: "Core", growth: "Growth", premium: "Premium", enterprise: "Enterprise",
  morningstar: "Morningstar", apple_news: "Apple News", big_news_network: "Big News Network",
  usa_today: "USA Today", benzinga: "Benzinga", associated_press: "Associated Press",
  business_insider: "Business Insider", barchart: "Barchart", yahoo_finance: "Yahoo Finance",
  msn: "MSN", ai_journal: "AI Journal", reuters: "Reuters", techbullion: "TechBullion",
  hackernoon: "HackerNoon",
} as const satisfies Record<ProductId, string>

const PRODUCT_ID_SET = new Set<string>(PRODUCT_IDS)
export function isProductId(value: string): value is ProductId { return PRODUCT_ID_SET.has(value) }
