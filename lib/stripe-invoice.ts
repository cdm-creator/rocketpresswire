import Stripe from "stripe"

export async function getCheckoutInvoicePdfUrl(
    stripe: Stripe,
    session: Stripe.Checkout.Session
) {
    if (session.payment_status !== "paid") {
        return null
    }

    let invoiceReference = session.invoice

    if (!invoiceReference) {
        const refreshedSession = await stripe.checkout.sessions.retrieve(
            session.id,
            { expand: ["invoice"] }
        )

        invoiceReference = refreshedSession.invoice
    }

    if (!invoiceReference) {
        return null
    }

    if (typeof invoiceReference !== "string" && invoiceReference.invoice_pdf) {
        return invoiceReference.invoice_pdf
    }

    const invoiceId =
        typeof invoiceReference === "string"
            ? invoiceReference
            : invoiceReference.id
    const invoice = await stripe.invoices.retrieve(invoiceId)

    return invoice.invoice_pdf ?? null
}
