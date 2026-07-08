import { google } from "googleapis"
import MailComposer from "nodemailer/lib/mail-composer"

type CustomerOrderProduct = {
    name: string
    quantity?: number
    amount?: number
}

type CustomerOrderConfirmationEmailData = {
    orderNumber: string
    customerName?: string | null
    customerEmail: string
    products: CustomerOrderProduct[]
    totalAmount: number
    currency: string
    source?: string
}

type CustomerConfirmationEmailMode =
    | "microsoft-plain-text"
    | "standard-html"

function requireEnv(name: string) {
    const value = process.env[name]?.trim()

    if (!value) {
        const message = `[customer-order-confirmation] Missing required environment variable: ${name}`
        console.error(message)
        throw new Error(message)
    }

    return value
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

function formatCurrency(amount: number, currency: string) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
    }).format(amount / 100)
}

function formatProduct(product: CustomerOrderProduct) {
    return `${product.name} x${product.quantity ?? 1}`
}

function isMicrosoftConsumerEmail(email: string) {
    const domain = email.trim().toLowerCase().split("@")[1]

    return ["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(
        domain
    )
}

function getGreeting(customerName: string | null | undefined) {
    const name = customerName?.trim()

    return name ? `Hi ${name},` : "Hello,"
}

function getPlainCustomerGreeting(customerName: string | null | undefined) {
    const name = customerName?.trim()

    return name ? `Hello ${name},` : "Hello,"
}

function buildTextEmail(
    data: CustomerOrderConfirmationEmailData,
    portalUrl: string
) {
    const products = data.products.map((product) => `- ${formatProduct(product)}`)

    return [
        "ROCKET PRESS WIRE",
        "",
        "Thank You for Your Order",
        "",
        getGreeting(data.customerName),
        "",
        "Thank you for choosing Rocket Press Wire.",
        "",
        "Your payment was successful and your order has been confirmed.",
        "Our team will begin processing your distribution campaign.",
        "",
        "ORDER SUMMARY",
        "",
        "Order Number:",
        data.orderNumber,
        "",
        "Products:",
        ...(products.length > 0 ? products : ["- No products listed"]),
        "",
        "Total Paid:",
        formatCurrency(data.totalAmount, data.currency),
        "",
        "Current Status:",
        "Processing",
        "",
        "TRACK YOUR ORDER",
        "",
        "You can track your campaign progress, publication status,",
        "and available placement links from your Customer Portal.",
        "",
        "View Customer Portal:",
        portalUrl,
        "",
        "Thank you for your order.",
        "",
        "Rocket Press Wire Team",
    ].join("\n")
}

function buildMicrosoftPlainTextEmail(data: CustomerOrderConfirmationEmailData) {
    const products = data.products.map((product) => `- ${formatProduct(product)}`)

    return [
        getPlainCustomerGreeting(data.customerName),
        "",
        "Thank you for your order with Rocket Press Wire.",
        "",
        "Your order has been received successfully and is now being processed.",
        "",
        "Order Number:",
        data.orderNumber,
        "",
        "Products:",
        ...(products.length > 0 ? products : ["- No products listed"]),
        "",
        "Total Paid:",
        formatCurrency(data.totalAmount, data.currency),
        "",
        "Current Status:",
        "Processing",
        "",
        "You will receive updates as your order progresses.",
        "",
        "Thank you,",
        "Rocket Press Wire Team",
    ].join("\n")
}

function buildHtmlEmail(
    data: CustomerOrderConfirmationEmailData,
    portalUrl: string
) {
    const productItems =
        data.products.length > 0
            ? data.products
                  .map(
                      (product) =>
                          `<li style="margin:0 0 8px;color:#ffffff;">${escapeHtml(
                              formatProduct(product)
                          )}</li>`
                  )
                  .join("")
            : '<li style="margin:0 0 8px;color:#ffffff;">No products listed</li>'

    return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Order Confirmed</title>
  </head>
  <body style="margin:0;padding:0;background:#07031d;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07031d;margin:0;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#17102f;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 28px 12px;">
                <div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#9d8eff;">ROCKET PRESS WIRE</div>
                <h1 style="margin:18px 0 14px;font-size:28px;line-height:1.2;color:#ffffff;">Thank You for Your Order</h1>
                <p style="margin:0 0 14px;color:#ffffff;font-size:16px;line-height:1.55;">${escapeHtml(
                    getGreeting(data.customerName)
                )}</p>
                <p style="margin:0;color:#aaa4bd;font-size:16px;line-height:1.55;">Thank you for choosing Rocket Press Wire. Your payment was successful and your order has been confirmed. Our team will begin processing your distribution campaign.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 4px;">
                <div style="margin:0 0 12px;color:#9d8eff;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Order Summary</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  ${buildHtmlRow("Order Number", data.orderNumber)}
                  ${buildHtmlRow("Total Paid", formatCurrency(data.totalAmount, data.currency))}
                  ${buildStatusRow()}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 28px 8px;">
                <div style="margin:0 0 10px;color:#aaa4bd;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Products</div>
                <ul style="margin:0;padding:0 0 0 18px;">${productItems}</ul>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 8px;">
                <div style="margin:0 0 10px;color:#9d8eff;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Track Your Order</div>
                <p style="margin:0;color:#aaa4bd;font-size:15px;line-height:1.55;">You can track your campaign progress, publication status, and available placement links from your Customer Portal.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 12px;">
                <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#765eff;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 20px;border-radius:8px;">View Customer Portal</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 32px;">
                <p style="margin:0;color:#aaa4bd;font-size:14px;line-height:1.5;">Thank you for your order.<br />Rocket Press Wire Team</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function buildHtmlRow(label: string, value: string) {
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #2b2440;">
        <div style="color:#aaa4bd;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(label)}</div>
        <div style="margin-top:5px;color:#ffffff;font-size:16px;line-height:1.45;">${escapeHtml(value)}</div>
      </td>
    </tr>`
}

function buildStatusRow() {
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #2b2440;">
        <div style="color:#aaa4bd;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Current Status</div>
        <div style="margin-top:8px;"><span style="display:inline-block;background:#203c38;color:#68e5a6;font-size:13px;font-weight:700;padding:6px 10px;border-radius:999px;">Processing</span></div>
      </td>
    </tr>`
}

function encodeBase64Url(rawMessage: Buffer) {
    return rawMessage
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "")
}

async function buildRawEmail({
    fromEmail,
    toEmail,
    subject,
    text,
    html,
}: {
    fromEmail: string
    toEmail: string
    subject: string
    text: string
    html?: string
}) {
    return new MailComposer({
        from: {
            name: "Rocket Press Wire",
            address: fromEmail,
        },
        to: toEmail,
        replyTo: fromEmail,
        subject,
        text,
        ...(html ? { html } : {}),
    })
        .compile()
        .build()
}

function getGmailClient() {
    const clientId = requireEnv("GOOGLE_CLIENT_ID")
    const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET")
    const refreshToken = requireEnv("GOOGLE_REFRESH_TOKEN")

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret)

    oauth2Client.setCredentials({
        refresh_token: refreshToken,
    })

    return google.gmail({
        version: "v1",
        auth: oauth2Client,
    })
}

export async function sendCustomerOrderConfirmationEmail(
    data: CustomerOrderConfirmationEmailData
) {
    const senderEmail = requireEnv("GMAIL_SENDER_EMAIL")

    const portalUrl =
        process.env.SITE_PORTAL_URL?.trim() ||
        "https://rocketpresswire.framer.website/portal"

    const customerEmail = data.customerEmail.trim().toLowerCase()

    if (!customerEmail) {
        throw new Error(
            "[customer-order-confirmation] Customer email is missing."
        )
    }

    try {
        const emailMode: CustomerConfirmationEmailMode =
            isMicrosoftConsumerEmail(customerEmail)
                ? "microsoft-plain-text"
                : "standard-html"
        const subject =
            emailMode === "microsoft-plain-text"
                ? `Order Confirmed - ${data.orderNumber}`
                : `Your Rocket Press Wire Order Is Confirmed - ${data.orderNumber}`
        const text =
            emailMode === "microsoft-plain-text"
                ? buildMicrosoftPlainTextEmail(data)
                : buildTextEmail(data, portalUrl)
        const html =
            emailMode === "microsoft-plain-text"
                ? undefined
                : buildHtmlEmail(data, portalUrl)

        console.log("CUSTOMER CONFIRMATION SEND ATTEMPT", {
            orderNumber: data.orderNumber,
            customerEmail,
            provider: "gmail-api",
            emailMode,
        })

        const rawMessage = await buildRawEmail({
            fromEmail: senderEmail,
            toEmail: customerEmail,
            subject,
            text,
            html,
        })
        const encodedMessage = encodeBase64Url(rawMessage)

        const result = await getGmailClient().users.messages.send({
            userId: "me",
            requestBody: {
                raw: encodedMessage,
            },
        })

        console.log("CUSTOMER CONFIRMATION EMAIL SENT", {
            orderNumber: data.orderNumber,
            customerEmail,
            provider: "gmail-api",
            emailMode,
            messageId: result.data.id,
        })

        return {
            success: true,
            messageId: result.data.id,
        }
    } catch (error) {
        console.error("CUSTOMER CONFIRMATION EMAIL FAILED", {
            orderNumber: data.orderNumber,
            customerEmail,
            provider: "gmail-api",
            error:
                error instanceof Error
                    ? error.message
                    : String(error),
        })

        throw error
    }
}
