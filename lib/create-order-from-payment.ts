import { sendAdminNewOrderEmail } from "@/lib/admin-order-notification"
import { sendCustomerOrderConfirmationEmail } from "@/lib/customer-order-confirmation"
import {
    addExpectedDays,
    resolveProductDelivery,
} from "@/lib/product-delivery-config"
import { supabaseAdmin } from "@/lib/supabase-admin"

export type PaymentOrderSource = "stripe" | "thrivecart"

export type PaymentOrderItem = {
    productId: string
    productName: string
    quantity: number
    unitAmount: number
}

export type CreateOrderFromPaymentInput = {
    source: PaymentOrderSource
    externalOrderId: string
    customerEmail: string
    customerName?: string | null
    amountTotal: number
    currency: string
    purchasedItems: PaymentOrderItem[]
}

export type CreateOrderFromPaymentResult =
    | {
          created: true
          duplicate: false
          orderId: string
          orderNumber: string
          itemCount: number
      }
    | {
          created: false
          duplicate: true
      }

function generateOrderNumber() {
    const timestamp = new Date()
        .toISOString()
        .replace(/[-:.TZ]/g, "")
        .slice(0, 14)
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()

    return `RPW-${timestamp}-${suffix}`
}

async function orderExists(source: PaymentOrderSource, externalOrderId: string) {
    const { data, error } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("source", source)
        .eq("external_order_id", externalOrderId)
        .maybeSingle()

    if (error) {
        throw error
    }

    return Boolean(data)
}

function validateInput(input: CreateOrderFromPaymentInput) {
    if (
        !input.externalOrderId ||
        !input.customerEmail ||
        !Number.isFinite(input.amountTotal) ||
        !input.currency ||
        input.purchasedItems.length === 0 ||
        input.purchasedItems.some(
            (item) =>
                !item.productId ||
                !item.productName ||
                !Number.isFinite(item.quantity) ||
                !Number.isFinite(item.unitAmount)
        )
    ) {
        throw new Error("Incomplete payment order input")
    }
}

export async function createOrderFromPayment(
    input: CreateOrderFromPaymentInput
): Promise<CreateOrderFromPaymentResult> {
    validateInput(input)

    if (await orderExists(input.source, input.externalOrderId)) {
        return {
            created: false,
            duplicate: true,
        }
    }

    const orderNumber = generateOrderNumber()
    const { data: order, error: orderError } = await supabaseAdmin
        .from("orders")
        .insert({
            order_number: orderNumber,
            customer_email: input.customerEmail,
            customer_name: input.customerName ?? null,
            source: input.source,
            external_order_id: input.externalOrderId,
            amount_total: input.amountTotal,
            currency: input.currency,
            payment_status: "paid",
            order_status: "processing",
        })
        .select("id, order_number, created_at")
        .single()

    if (orderError) {
        if (orderError.code === "23505") {
            return {
                created: false,
                duplicate: true,
            }
        }

        throw orderError
    }

    const orderItems = input.purchasedItems.map((item) => {
        const productDelivery = resolveProductDelivery({
            productId: item.productId,
            productName: item.productName,
            externalId: item.productId,
            stripePriceId: input.source === "stripe" ? item.productId : null,
        })

        if (!productDelivery) {
            console.warn("UNMAPPED PAYMENT PRODUCT", {
                source: input.source,
                productId: item.productId,
                productName: item.productName,
                externalOrderId: input.externalOrderId,
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
        console.error("[create-order-from-payment] Failed to insert order items", {
            source: input.source,
            externalOrderId: input.externalOrderId,
            orderId: order.id,
            error: orderItemsError.message,
        })

        const { error: cleanupError } = await supabaseAdmin
            .from("orders")
            .delete()
            .eq("id", order.id)

        if (cleanupError) {
            console.error(
                "[create-order-from-payment] Failed to clean up incomplete order",
                {
                    source: input.source,
                    externalOrderId: input.externalOrderId,
                    orderId: order.id,
                    error: cleanupError.message,
                }
            )
        }

        throw new Error("Failed to create order items")
    }

    const emailProducts = input.purchasedItems.map((item) => ({
        name: item.productName,
        quantity: item.quantity,
        amount: item.unitAmount,
    }))

    try {
        await sendAdminNewOrderEmail({
            orderNumber: order.order_number,
            customerName: input.customerName ?? null,
            customerEmail: input.customerEmail,
            source: input.source,
            products: emailProducts,
            totalAmount: input.amountTotal,
            currency: input.currency,
        })
    } catch (emailError) {
        console.error("Admin notification email failed:", emailError)
    }

    try {
        await sendCustomerOrderConfirmationEmail({
            orderNumber: order.order_number,
            customerName: input.customerName ?? null,
            customerEmail: input.customerEmail,
            products: emailProducts,
            totalAmount: input.amountTotal,
            currency: input.currency,
            source: input.source,
        })
    } catch (emailError) {
        console.error("Customer confirmation email failed:", emailError)
    }

    return {
        created: true,
        duplicate: false,
        orderId: order.id,
        orderNumber: order.order_number,
        itemCount: orderItems.length,
    }
}
