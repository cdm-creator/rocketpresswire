import { sendAdminNewOrderEmail } from "@/lib/admin-order-notification"
import { sendCustomerOrderConfirmationEmail } from "@/lib/customer-order-confirmation"
import {
    addExpectedDays,
    resolveProductDelivery,
} from "@/lib/product-delivery-config"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"

type JsonObject = Record<string, unknown>

type ThriveCartOrderItem = {
    productId: string
    productName: string
    quantity: number
    unitAmount: number | null
}

const SENSITIVE_KEY_PATTERN =
    /card|cvv|cvc|secret|token|password|authorization|signature|key|payment_method|billing_address/i

const SUCCESS_VALUES = new Set([
    "paid",
    "complete",
    "completed",
    "success",
    "successful",
    "approved",
])

const SUPPORTED_SUCCESS_EVENTS = new Set(["order.success"])

function generateOrderNumber() {
    const timestamp = new Date()
        .toISOString()
        .replace(/[-:.TZ]/g, "")
        .slice(0, 14)
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()

    return `RPW-${timestamp}-${suffix}`
}

function isJsonObject(value: unknown): value is JsonObject {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function parseFormValue(value: string): unknown {
    const trimmedValue = value.trim()

    if (!trimmedValue) {
        return value
    }

    if (
        (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) ||
        (trimmedValue.startsWith("[") && trimmedValue.endsWith("]"))
    ) {
        try {
            return JSON.parse(trimmedValue) as unknown
        } catch {
            return value
        }
    }

    return value
}

function parseFormEncodedPayload(body: string) {
    const params = new URLSearchParams(body)
    const payload: JsonObject = {}

    params.forEach((value, key) => {
        payload[key] = parseFormValue(value)
    })

    return payload
}

function parseFormDataValue(value: FormDataEntryValue): unknown {
    if (typeof value === "string") {
        return parseFormValue(value)
    }

    return {
        name: value.name,
        size: value.size,
        type: value.type,
    }
}

function parseMultipartPayload(formData: FormData) {
    const payload: JsonObject = {}

    formData.forEach((value, key) => {
        payload[key] = parseFormDataValue(value)
    })

    return payload
}

async function parseWebhookPayload(request: Request, contentType: string | null) {
    if (contentType?.includes("application/json")) {
        const body = await request.clone().text()

        if (!body.trim()) {
            return {}
        }

        return (await request.json()) as unknown
    }

    if (contentType?.includes("application/x-www-form-urlencoded")) {
        return parseFormEncodedPayload(await request.text())
    }

    if (contentType?.includes("multipart/form-data")) {
        return parseMultipartPayload(await request.formData())
    }

    const body = await request.text()

    if (!body.trim()) {
        return {}
    }

    try {
        return JSON.parse(body) as unknown
    } catch {
        return parseFormEncodedPayload(body)
    }
}

function redactSensitiveFields(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => redactSensitiveFields(item))
    }

    if (!isJsonObject(value)) {
        return value
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
            key,
            SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSensitiveFields(item),
        ])
    )
}

function getPathValue(value: unknown, path: string[]) {
    return path.reduce<unknown>((currentValue, key) => {
        if (!isJsonObject(currentValue)) {
            return undefined
        }

        return currentValue[key]
    }, value)
}

function findFirstPathValue(value: unknown, paths: string[][]) {
    for (const path of paths) {
        const pathValue = getPathValue(value, path)

        if (pathValue !== undefined && pathValue !== null && pathValue !== "") {
            return pathValue
        }
    }

    return undefined
}

function findFirstDeepValue(value: unknown, keyNames: string[]) {
    const normalizedKeys = new Set(keyNames.map((key) => key.toLowerCase()))
    const queue: unknown[] = [value]

    while (queue.length > 0) {
        const currentValue = queue.shift()

        if (Array.isArray(currentValue)) {
            queue.push(...currentValue)
            continue
        }

        if (!isJsonObject(currentValue)) {
            continue
        }

        for (const [key, item] of Object.entries(currentValue)) {
            if (
                normalizedKeys.has(key.toLowerCase()) &&
                item !== undefined &&
                item !== null &&
                item !== ""
            ) {
                return item
            }

            if (typeof item === "object" && item !== null) {
                queue.push(item)
            }
        }
    }

    return undefined
}

function toStringValue(value: unknown) {
    if (typeof value === "string") {
        return value.trim()
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value)
    }

    return null
}

function normalizeEmail(value: unknown) {
    const email = toStringValue(value)

    return email ? email.trim().toLowerCase() : null
}

function toSmallestCurrencyUnit(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Number.isInteger(value) ? value : Math.round(value * 100)
    }

    if (typeof value !== "string") {
        return null
    }

    const normalizedValue = value.replace(/[^0-9.-]/g, "")

    if (!normalizedValue) {
        return null
    }

    const amount = Number(normalizedValue)

    if (!Number.isFinite(amount)) {
        return null
    }

    return normalizedValue.includes(".") ? Math.round(amount * 100) : amount
}

function toNumberValue(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value
    }

    if (typeof value !== "string") {
        return null
    }

    const number = Number(value.replace(/[^0-9.-]/g, ""))

    return Number.isFinite(number) ? number : null
}

function getEventType(payload: unknown) {
    return toStringValue(
        findFirstPathValue(payload, [
            ["event_type"],
            ["event"],
            ["type"],
            ["notification_type"],
        ]) ?? findFirstDeepValue(payload, ["event_type", "event", "type"])
    )
}

function getCustomerEmail(payload: unknown) {
    return normalizeEmail(
        findFirstPathValue(payload, [
            ["customer", "email"],
            ["customer", "email_address"],
            ["buyer", "email"],
            ["client", "email"],
            ["email"],
            ["customer_email"],
        ]) ?? findFirstDeepValue(payload, ["email", "customer_email", "email_address"])
    )
}

function getCustomerName(payload: unknown) {
    const fullName = toStringValue(
        findFirstPathValue(payload, [
            ["customer", "name"],
            ["customer", "full_name"],
            ["buyer", "name"],
            ["client", "name"],
            ["name"],
            ["customer_name"],
        ]) ?? findFirstDeepValue(payload, ["full_name", "customer_name"])
    )

    if (fullName) {
        return fullName
    }

    const firstName = toStringValue(
        findFirstDeepValue(payload, ["first_name", "firstname"])
    )
    const lastName = toStringValue(
        findFirstDeepValue(payload, ["last_name", "lastname"])
    )
    const joinedName = [firstName, lastName].filter(Boolean).join(" ").trim()

    return joinedName || null
}

function getExternalOrderId(payload: unknown) {
    return toStringValue(
        findFirstPathValue(payload, [
            ["order_id"],
            ["order", "id"],
            ["transaction_id"],
            ["transaction", "id"],
            ["invoice_id"],
            ["id"],
        ]) ??
            findFirstDeepValue(payload, [
                "order_id",
                "transaction_id",
                "invoice_id",
                "reference",
            ])
    )
}

function getCurrency(payload: unknown) {
    const currency = toStringValue(
        findFirstPathValue(payload, [
            ["currency"],
            ["order", "currency"],
            ["transaction", "currency"],
            ["payment", "currency"],
        ]) ?? findFirstDeepValue(payload, ["currency"])
    )

    return currency?.toLowerCase() ?? null
}

function getOrderAmount(payload: unknown) {
    return toSmallestCurrencyUnit(
        findFirstPathValue(payload, [
            ["amount_total"],
            ["total"],
            ["total_amount"],
            ["order", "total"],
            ["order", "amount"],
            ["transaction", "amount"],
            ["payment", "amount"],
            ["amount"],
        ]) ??
            findFirstDeepValue(payload, [
                "amount_total",
                "total_amount",
                "total",
                "amount",
            ])
    )
}

function getPaymentStatus(payload: unknown) {
    return toStringValue(
        findFirstPathValue(payload, [
            ["payment_status"],
            ["status"],
            ["order", "status"],
            ["transaction", "status"],
            ["payment", "status"],
        ]) ?? findFirstDeepValue(payload, ["payment_status", "status"])
    )
}

function isSuccessfulPurchaseEvent(payload: unknown) {
    const eventType = getEventType(payload)?.toLowerCase()
    const paymentStatus = getPaymentStatus(payload)?.toLowerCase()

    if (!eventType || !SUPPORTED_SUCCESS_EVENTS.has(eventType)) {
        return false
    }

    if (!paymentStatus) {
        return true
    }

    return SUCCESS_VALUES.has(paymentStatus)
}

function getProductContainers(payload: unknown) {
    const containers = [
        findFirstPathValue(payload, [["products"], ["items"], ["line_items"]]),
        findFirstPathValue(payload, [["order", "products"], ["order", "items"]]),
        findFirstPathValue(payload, [["product"], ["item"]]),
    ].filter((value) => value !== undefined && value !== null)

    if (containers.length > 0) {
        return containers
    }

    return [payload]
}

function extractFlatChargeItems(payload: JsonObject) {
    const items: ThriveCartOrderItem[] = []

    for (let index = 0; index < 50; index += 1) {
        const productId = String(
            payload[`order[charges][${index}][item_identifier]`] ||
                payload[`order[charges][${index}][product_id]`] ||
                ""
        ).trim()
        const productName =
            String(
                payload[`order[charges][${index}][name]`] ||
                    payload[`order[charges][${index}][label]`] ||
                    ""
            ).trim() || productId
        const quantity =
            toNumberValue(payload[`order[charges][${index}][quantity]`]) ?? 1
        const unitAmount =
            toNumberValue(payload[`order[charges][${index}][unit_price]`]) ??
            toNumberValue(payload[`order[charges][${index}][amount]`])

        if (!productId && !productName) {
            continue
        }

        if (!productId || !productName) {
            continue
        }

        items.push({
            productId,
            productName,
            quantity,
            unitAmount,
        })
    }

    return items
}

function extractOrderItems(payload: unknown, fallbackAmount: number | null) {
    const containers = getProductContainers(payload)
    const items: ThriveCartOrderItem[] = []

    for (const container of containers) {
        const productValues = Array.isArray(container) ? container : [container]

        for (const productValue of productValues) {
            const productId = toStringValue(
                findFirstPathValue(productValue, [
                    ["product_id"],
                    ["product", "id"],
                    ["id"],
                    ["reference"],
                    ["product_reference"],
                ]) ??
                    findFirstDeepValue(productValue, [
                        "product_id",
                        "product_reference",
                        "reference",
                    ])
            )
            const productName = toStringValue(
                findFirstPathValue(productValue, [
                    ["product_name"],
                    ["product", "name"],
                    ["name"],
                    ["title"],
                ]) ??
                    findFirstDeepValue(productValue, [
                        "product_name",
                        "product_title",
                        "title",
                    ])
            )
            const unitAmount =
                toSmallestCurrencyUnit(
                    findFirstPathValue(productValue, [
                        ["unit_amount"],
                        ["amount"],
                        ["price"],
                        ["product", "amount"],
                        ["product", "price"],
                    ]) ??
                        findFirstDeepValue(productValue, [
                            "unit_amount",
                            "amount",
                            "price",
                        ])
                ) ?? fallbackAmount
            const quantity =
                toNumberValue(
                    findFirstPathValue(productValue, [
                        ["quantity"],
                        ["qty"],
                        ["product", "quantity"],
                    ]) ?? findFirstDeepValue(productValue, ["quantity", "qty"])
                ) ?? 1

            if (productId && productName) {
                items.push({
                    productId,
                    productName,
                    quantity,
                    unitAmount,
                })
            }
        }
    }

    return items
}

async function orderExists(externalOrderId: string) {
    const { data, error } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("source", "thrivecart")
        .eq("external_order_id", externalOrderId)
        .maybeSingle()

    if (error) {
        throw error
    }

    return Boolean(data)
}

export async function HEAD() {
    return new Response(null, { status: 200 })
}

export async function POST(request: Request) {
    let payload: unknown
    const contentType = request.headers.get("content-type")

    try {
        payload = await parseWebhookPayload(request, contentType)
    } catch (error) {
        console.warn("[thrivecart-webhook] Malformed payload", {
            method: request.method,
            contentType,
            error: error instanceof Error ? error.message : "Unknown parse error",
        })

        return Response.json({ error: "Malformed payload" }, { status: 400 })
    }

    const payloadObject = isJsonObject(payload) ? payload : {}
    const eventType = getEventType(payload)
    const customerEmail = String(payloadObject["customer[email]"] || "")
        .trim()
        .toLowerCase()
    const customerName =
        String(
            payloadObject["customer[name]"] ||
                payloadObject["customer[first_name]"] ||
                ""
        ).trim() || null
    const externalOrderId = String(
        payloadObject.order_id ||
            payloadObject["order[id]"] ||
            payloadObject.invoice_id ||
            ""
    ).trim()
    const currency = String(payloadObject.currency || "USD")
        .trim()
        .toLowerCase()
    const amountTotal = Number(payloadObject["order[total]"] || 0)
    const productId = String(
        payloadObject["order[charges][0][item_identifier]"] ||
            payloadObject.base_product ||
            ""
    ).trim()
    const productName =
        String(
            payloadObject["order[charges][0][name]"] ||
                payloadObject["order[charges][0][label]"] ||
                payloadObject.base_product_name ||
                "ThriveCart Product"
        ).trim() || "ThriveCart Product"
    const quantity = Number(payloadObject["order[charges][0][quantity]"] || 1)
    const unitAmount = Number(
        payloadObject["order[charges][0][unit_price]"] ||
            payloadObject["order[charges][0][amount]"] ||
            0
    )
    const extractedItems = extractFlatChargeItems(payloadObject)
    const nestedItems = extractOrderItems(payload, unitAmount)
    const purchasedItems =
        extractedItems.length > 0
            ? extractedItems
            : nestedItems.length > 0
              ? nestedItems
            : [
                  {
                      productId,
                      productName,
                      quantity,
                      unitAmount,
                  },
              ]

    console.log("[thrivecart-webhook] Received event", {
        method: request.method,
        contentType,
        eventType,
        externalOrderId,
        customerEmailPresent: Boolean(customerEmail),
        amountTotal,
        currency,
        productId,
        productName,
        quantity,
        unitAmount,
        itemCount: purchasedItems.length,
    })

    if (!isSuccessfulPurchaseEvent(payload)) {
        console.log("[thrivecart-webhook] Ignoring unsupported event", {
            eventType,
            paymentStatus: getPaymentStatus(payload),
        })

        return Response.json({ received: true, ignored: true }, { status: 200 })
    }

    if (
        !customerEmail ||
        !externalOrderId ||
        !Number.isFinite(amountTotal) ||
        !currency ||
        purchasedItems.length === 0 ||
        purchasedItems.some(
            (item) =>
                !item.productId ||
                !item.productName ||
                !Number.isFinite(item.quantity) ||
                item.unitAmount === null ||
                !Number.isFinite(item.unitAmount)
        )
    ) {
        console.log("[thrivecart-webhook] Ignoring paid event with incomplete mapping", {
            eventType,
            hasCustomerEmail: Boolean(customerEmail),
            hasExternalOrderId: Boolean(externalOrderId),
            hasAmountTotal: Number.isFinite(amountTotal),
            hasCurrency: Boolean(currency),
            hasItems: purchasedItems.length > 0,
        })

        return Response.json({ received: true, ignored: true }, { status: 200 })
    }

    try {
        if (await orderExists(externalOrderId)) {
            console.log("[thrivecart-webhook] Duplicate order skipped", {
                externalOrderId,
            })

            return Response.json({ received: true }, { status: 200 })
        }

        const orderNumber = generateOrderNumber()

        const { data: order, error: orderError } = await supabaseAdmin
            .from("orders")
            .insert({
                order_number: orderNumber,
                customer_email: customerEmail,
                customer_name: customerName,
                source: "thrivecart",
                external_order_id: externalOrderId,
                amount_total: amountTotal,
                currency,
                payment_status: "paid",
                order_status: "processing",
            })
            .select("id, order_number, created_at")
            .single()

        if (orderError) {
            if (orderError.code === "23505") {
                console.log("[thrivecart-webhook] Duplicate order skipped after race", {
                    externalOrderId,
                })

                return Response.json({ received: true }, { status: 200 })
            }

            throw orderError
        }

        const orderItems = purchasedItems.map((item) => {
            const productDelivery = resolveProductDelivery({
                productId: item.productId,
                productName: item.productName,
                externalId: item.productId,
            })

            if (!productDelivery) {
                console.warn("UNMAPPED THRIVECART PRODUCT", {
                    productId: item.productId,
                    productName: item.productName,
                    externalOrderId,
                })
            }

            return {
                order_id: order.id,
                product_id: item.productId,
                product_name: item.productName,
                quantity: item.quantity,
                unit_amount: item.unitAmount,
                item_status: "processing",
                delivery_text: productDelivery?.deliveryText ?? null,
                expected_completion_at: productDelivery
                    ? addExpectedDays(order.created_at, productDelivery.expectedDays)
                    : null,
                published_url: null,
            }
        })

        const { error: orderItemsError } = await supabaseAdmin
            .from("order_items")
            .insert(orderItems)

        if (orderItemsError) {
            console.error("[thrivecart-webhook] Failed to insert order items", {
                externalOrderId,
                orderId: order.id,
                error: orderItemsError.message,
            })

            const { error: cleanupError } = await supabaseAdmin
                .from("orders")
                .delete()
                .eq("id", order.id)

            if (cleanupError) {
                console.error("[thrivecart-webhook] Failed to clean up incomplete order", {
                    externalOrderId,
                    orderId: order.id,
                    error: cleanupError.message,
                })
            }

            return Response.json(
                { error: "Failed to create order items" },
                { status: 500 }
            )
        }

        console.log("[thrivecart-webhook] Order created", {
            externalOrderId,
            orderId: order.id,
            itemCount: orderItems.length,
        })

        const emailProducts = purchasedItems.map((item) => ({
            name: item.productName,
            quantity: item.quantity,
            amount: item.unitAmount ?? undefined,
        }))

        try {
            await sendAdminNewOrderEmail({
                orderNumber: order.order_number,
                customerName,
                customerEmail,
                source: "thrivecart",
                products: emailProducts,
                totalAmount: amountTotal,
                currency,
            })
        } catch (emailError) {
            console.error("Admin notification email failed:", emailError)
        }

        try {
            await sendCustomerOrderConfirmationEmail({
                orderNumber: order.order_number,
                customerName,
                customerEmail,
                products: emailProducts,
                totalAmount: amountTotal,
                currency,
                source: "thrivecart",
            })
        } catch (emailError) {
            console.error("Customer confirmation email failed:", emailError)
        }

        return Response.json({ received: true }, { status: 200 })
    } catch (error) {
        console.error("[thrivecart-webhook] Failed to process event", {
            eventType,
            externalOrderId,
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return Response.json(
            { error: "Webhook processing failed" },
            { status: 500 }
        )
    }
}
