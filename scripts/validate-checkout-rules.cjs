const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")
const vm = require("node:vm")

const root = path.resolve(__dirname, "..")
const moduleCache = new Map()

function loadTypeScriptModule(relativePath) {
    const absolutePath = path.join(root, relativePath)

    if (moduleCache.has(absolutePath)) {
        return moduleCache.get(absolutePath).exports
    }

    const source = fs.readFileSync(absolutePath, "utf8")
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText
    const module = { exports: {} }
    moduleCache.set(absolutePath, module)

    const localRequire = (request) => {
        if (request.startsWith("@/")) {
            return loadTypeScriptModule(`${request.slice(2)}.ts`)
        }

        return require(request)
    }

    vm.runInNewContext(output, {
        module,
        exports: module.exports,
        require: localRequire,
        console,
        Date,
        Intl,
        Set,
    }, { filename: absolutePath })

    return module.exports
}

const products = loadTypeScriptModule("lib/products.ts")
const rules = loadTypeScriptModule("lib/package-addon-rules.ts")
const delivery = loadTypeScriptModule("lib/product-delivery-config.ts")

const validCases = [
    ["core", "usa_today", "benzinga", "associated_press"],
    ["growth", "business_insider", "reuters", "apple_news"],
    ["premium", "yahoo_finance", "msn", "techbullion"],
    ["enterprise", "morningstar", "reuters", "hackernoon"],
    ["core"],
    ["enterprise"],
    ["msn", "reuters", "apple_news"],
]

const invalidCases = [
    ["enterprise", "usa_today"],
    ["premium", "business_insider"],
    ["growth", "usa_today"],
    ["core", "growth", "reuters"],
]

for (const productIds of validCases) {
    assert.equal(rules.validatePackageSelection(productIds).valid, true)
}

for (const productIds of invalidCases) {
    assert.equal(rules.validatePackageSelection(productIds).valid, false)
}

assert.equal(products.isProductId("unknown_product"), false)
assert.deepEqual(
    Object.fromEntries(
        Object.entries(rules.PACKAGE_OUTLET_COMPATIBILITY).map(
            ([packageId, outlets]) => [packageId, outlets.length]
        )
    ),
    { core: 14, growth: 11, premium: 9, enterprise: 6 }
)

for (const productId of products.PRODUCT_IDS) {
    const config = delivery.getProductDeliveryBySlug(productId)
    const expected = productId === "enterprise"
        ? "7 Business Days"
        : "5 Business Days"

    assert.equal(config.deliveryText, expected)
    assert.equal(config.expectedDays, productId === "enterprise" ? 7 : 5)
}

assert.deepEqual(
    { ...delivery.buildCanonicalDeliveryByProduct(["enterprise", "reuters"]) },
    { enterprise: "7 Business Days", reuters: "5 Business Days" }
)
assert.deepEqual(
    {
        ...delivery.buildCanonicalDeliveryByProduct([
            "msn",
            "reuters",
            "apple_news",
        ]),
    },
    {
        msn: "5 Business Days",
        reuters: "5 Business Days",
        apple_news: "5 Business Days",
    }
)

assert.equal(
    delivery.normalizeDeliveryEstimate("5 Business Days").deliveryText,
    "5 Business Days"
)
assert.equal(
    delivery.normalizeDeliveryEstimate("7 Business Days").deliveryText,
    "7 Business Days"
)

console.log(
    "Checkout rules validated: 7 valid cases, 5 invalid/unknown cases, " +
    "package matrix 14/11/9/6, and 18 authoritative delivery rules."
)
