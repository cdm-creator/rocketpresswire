import type Stripe from "stripe"

import { supabaseAdmin } from "@/lib/supabase-admin"
import { getStripe } from "@/lib/stripe"

export const runtime = "nodejs"

const PRODUCT_DATA = {
    msn: {
        name: "MSN",
        delivery: "5 Days",
        priceId: "price_1ToioORtNm75vIFItIQYFEm7",
    },

    reuters: {
        name: "Reuters",
        delivery: "7 Days",
        priceId: "price_1ToiyORtNm75vIFInjjJeQxF",
    },
} as const

type ProductId = keyof typeof PRODUCT_DATA

function generateOrderNumber() {
    const timestamp = new Date()
        .toISOString()
        .replace(/[-:.TZ]/g, "")
        .slice(0, 14)
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()

    return `RPW-${timestamp}-${suffix}`
}

function parseSelectedProducts(value: string | null | undefined) {
    if (!value) {
        return []
    }

    return [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))]
}

function isProductId(productId: string): productId is ProductId {
    return productId in PRODUCT_DATA
}

async function orderExists(sessionId: string) {
    const { data, error } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("source", "stripe")
        .eq("external_order_id", sessionId)
        .maybeSingle()

    if (error) {
        throw error
    }

    return Boolean(data)
}

export async function POST(request: Request) {
    const stripe = getStripe()
    const signature = request.headers.get("stripe-signature")
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    if (!webhookSecret) {
        console.error("[stripe-webhook] Missing STRIPE_WEBHOOK_SECRET")

        return Response.json(
            { error: "Missing STRIPE_WEBHOOK_SECRET" },
            { status: 500 }
        )
    }

    if (!signature) {
        console.warn("[stripe-webhook] Missing Stripe-Signature header")

        return Response.json(
            { error: "Missing Stripe-Signature header" },
            { status: 400 }
        )
    }

    const body = await request.text()
    let event: Stripe.Event

    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (error) {
        console.warn("[stripe-webhook] Invalid webhook signature", {
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return Response.json(
            { error: "Invalid webhook signature" },
            { status: 400 }
        )
    }

    console.log("[stripe-webhook] Received event", {
        eventId: event.id,
        eventType: event.type,
    })

    if (event.type !== "checkout.session.completed") {
        console.log("[stripe-webhook] Ignoring unsupported event type", {
            eventId: event.id,
            eventType: event.type,
        })

        return Response.json({ received: true }, { status: 200 })
    }

    const session = event.data.object as Stripe.Checkout.Session
    const sessionId = session.id

    try {
        if (await orderExists(sessionId)) {
            console.log("[stripe-webhook] Duplicate order skipped", {
                eventId: event.id,
                sessionId,
            })

            return Response.json({ received: true }, { status: 200 })
        }

        const customerEmail = session.customer_details?.email?.trim().toLowerCase()
        const customerName = session.customer_details?.name?.trim() || null
        const selectedProducts = parseSelectedProducts(
            session.metadata?.selected_products
        )

        if (!customerEmail) {
            console.error("[stripe-webhook] Missing customer email", {
                eventId: event.id,
                sessionId,
            })

            return Response.json(
                { error: "Missing customer email" },
                { status: 400 }
            )
        }

        if (selectedProducts.length === 0) {
            console.error("[stripe-webhook] Missing selected products metadata", {
                eventId: event.id,
                sessionId,
            })

            return Response.json(
                { error: "Missing selected products" },
                { status: 400 }
            )
        }

        const invalidProducts = selectedProducts.filter((id) => !isProductId(id))

        if (invalidProducts.length > 0) {
            console.error("[stripe-webhook] Invalid selected products", {
                eventId: event.id,
                sessionId,
                invalidProducts,
            })

            return Response.json(
                { error: "Invalid selected products" },
                { status: 400 }
            )
        }

        const validProducts = selectedProducts as ProductId[]

        console.log("[stripe-webhook] Processing completed checkout session", {
            eventId: event.id,
            sessionId,
            customerEmail,
            selectedProducts: validProducts,
        })

        const priceResults = await Promise.all(
            validProducts.map(async (productId) => {
                const product = PRODUCT_DATA[productId]
                const price = await stripe.prices.retrieve(product.priceId)

                if (price.unit_amount === null) {
                    throw new Error(
                        `Stripe Price ${product.priceId} is missing unit_amount`
                    )
                }

                return {
                    productId,
                    product,
                    unitAmount: price.unit_amount,
                }
            })
        )

        const { data: order, error: orderError } = await supabaseAdmin
            .from("orders")
            .insert({
                order_number: generateOrderNumber(),
                customer_email: customerEmail,
                customer_name: customerName,
                source: "stripe",
                external_order_id: sessionId,
                amount_total: session.amount_total,
                currency: session.currency,
                payment_status: session.payment_status,
                order_status: "processing",
            })
            .select("id")
            .single()

        if (orderError) {
            if (orderError.code === "23505") {
                console.log("[stripe-webhook] Duplicate order skipped after race", {
                    eventId: event.id,
                    sessionId,
                })

                return Response.json({ received: true }, { status: 200 })
            }

            throw orderError
        }

        const orderItems = priceResults.map(({ productId, product, unitAmount }) => ({
            order_id: order.id,
            product_id: productId,
            product_name: product.name,
            quantity: 1,
            unit_amount: unitAmount,
            item_status: "processing",
            delivery_text: product.delivery,
            published_url: null,
        }))

        const { error: orderItemsError } = await supabaseAdmin
            .from("order_items")
            .insert(orderItems)

        if (orderItemsError) {
            console.error("[stripe-webhook] Failed to insert order items", {
                eventId: event.id,
                sessionId,
                orderId: order.id,
                error: orderItemsError.message,
            })

            const { error: cleanupError } = await supabaseAdmin
                .from("orders")
                .delete()
                .eq("id", order.id)

            if (cleanupError) {
                console.error("[stripe-webhook] Failed to clean up incomplete order", {
                    eventId: event.id,
                    sessionId,
                    orderId: order.id,
                    error: cleanupError.message,
                })
            }

            return Response.json(
                { error: "Failed to create order items" },
                { status: 500 }
            )
        }

        console.log("[stripe-webhook] Order created", {
            eventId: event.id,
            sessionId,
            orderId: order.id,
            itemCount: orderItems.length,
        })

        return Response.json({ received: true }, { status: 200 })
    } catch (error) {
        console.error("[stripe-webhook] Failed to process event", {
            eventId: event.id,
            sessionId,
            error: error instanceof Error ? error.message : "Unknown error",
        })

        return Response.json(
            { error: "Webhook processing failed" },
            { status: 500 }
        )
    }
}
