import nodemailer from "nodemailer"
import type SMTPTransport from "nodemailer/lib/smtp-transport"

type AdminOrderProduct = {
    name: string
    quantity?: number
    amount?: number | null
}

type AdminNewOrderEmailData = {
    orderNumber: string
    customerName?: string | null
    customerEmail: string
    source: "stripe" | "thrivecart" | string
    products: AdminOrderProduct[]
    totalAmount: number
    currency: string
}

let transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null =
    null

function requireEnv(name: string) {
    const value = process.env[name]?.trim()

    if (!value) {
        const message = `[admin-order-notification] Missing required environment variable: ${name}`
        console.error(message)
        throw new Error(message)
    }

    return value
}

function getAdminRecipients() {
    const configuredRecipients =
        process.env.ADMIN_NOTIFICATION_EMAIL?.trim() ||
        process.env.ADMIN_ORDER_NOTIFICATION_EMAIL?.trim() ||
        process.env.ADMIN_EMAIL?.trim()

    if (!configuredRecipients) {
        throw new Error(
            "[admin-order-notification] Missing admin recipient. Configure ADMIN_NOTIFICATION_EMAIL, ADMIN_ORDER_NOTIFICATION_EMAIL, or ADMIN_EMAIL."
        )
    }

    const recipients = configuredRecipients
        .split(",")
        .map((recipient) => recipient.trim())
        .filter(Boolean)

    if (recipients.length === 0) {
        throw new Error(
            "[admin-order-notification] Admin recipient configuration contains no email addresses."
        )
    }

    return recipients
}

function getTransporter() {
    if (transporter) {
        return transporter
    }

    const smtpUser = requireEnv("SMTP_USER")
    const smtpAppPassword = requireEnv("SMTP_APP_PASSWORD")

    transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
            user: smtpUser,
            pass: smtpAppPassword,
        },
    })

    return transporter
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

function formatSource(source: string) {
    return source
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ")
}

function formatCurrency(amount: number, currency: string) {
    const normalizedCurrency = currency.toUpperCase()

    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: normalizedCurrency,
    }).format(amount / 100)
}

function formatProduct(product: AdminOrderProduct) {
    const quantity = product.quantity ?? 1

    return `${product.name} x${quantity}`
}

function buildTextEmail(data: AdminNewOrderEmailData, adminUrl: string) {
    const customerName = data.customerName?.trim() || "Not provided"
    const products = data.products.map((product) => `- ${formatProduct(product)}`)

    return [
        "ROCKET PRESS WIRE",
        "",
        "New Order Received",
        "",
        "A new order has been successfully received.",
        "",
        "Order Number:",
        data.orderNumber,
        "",
        "Customer:",
        customerName,
        "",
        "Customer Email:",
        data.customerEmail,
        "",
        "Payment Source:",
        formatSource(data.source),
        "",
        "Products:",
        ...(products.length > 0 ? products : ["- No products listed"]),
        "",
        "Total Paid:",
        formatCurrency(data.totalAmount, data.currency),
        "",
        "Currency:",
        data.currency.toUpperCase(),
        "",
        "Initial Status:",
        "Processing",
        "",
        "Open Admin Dashboard:",
        adminUrl,
    ].join("\n")
}

function buildHtmlEmail(data: AdminNewOrderEmailData, adminUrl: string) {
    const customerName = data.customerName?.trim() || "Not provided"
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
    <title>New Order Received</title>
  </head>
  <body style="margin:0;padding:0;background:#07031d;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07031d;margin:0;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#17102f;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 28px 16px;">
                <div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#aaa4bd;">ROCKET PRESS WIRE</div>
                <h1 style="margin:18px 0 10px;font-size:28px;line-height:1.2;color:#ffffff;">New Order Received</h1>
                <p style="margin:0;color:#aaa4bd;font-size:16px;line-height:1.55;">A new order has been successfully received.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 4px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  ${buildHtmlRow("Order Number", data.orderNumber)}
                  ${buildHtmlRow("Customer", customerName)}
                  ${buildHtmlRow("Customer Email", data.customerEmail)}
                  ${buildHtmlRow("Payment Source", formatSource(data.source))}
                  ${buildHtmlRow("Total Paid", formatCurrency(data.totalAmount, data.currency))}
                  ${buildHtmlRow("Currency", data.currency.toUpperCase())}
                  ${buildHtmlRow("Initial Status", "Processing")}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 28px 8px;">
                <div style="margin:0 0 10px;color:#aaa4bd;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Products</div>
                <ul style="margin:0;padding:0 0 0 18px;">${productItems}</ul>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#765eff;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 20px;border-radius:8px;">Open Admin Dashboard</a>
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
      <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
        <div style="color:#aaa4bd;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(label)}</div>
        <div style="margin-top:5px;color:#ffffff;font-size:16px;line-height:1.45;">${escapeHtml(value)}</div>
      </td>
    </tr>`
}

export async function sendAdminNewOrderEmail(data: AdminNewOrderEmailData) {
    let recipients: string[] = []

    try {
        const smtpUser = requireEnv("SMTP_USER")
        requireEnv("SMTP_APP_PASSWORD")
        recipients = getAdminRecipients()

        const adminUrl =
            process.env.SITE_ADMIN_URL?.trim() ||
            "https://rocketpresswire.framer.website/admin"

        const info = await getTransporter().sendMail({
            from: `Rocket Press Wire Orders <${smtpUser}>`,
            replyTo: smtpUser,
            to: recipients,
            subject: `New Order Received - ${data.orderNumber}`,
            text: buildTextEmail(data, adminUrl),
            html: buildHtmlEmail(data, adminUrl),
        })

        if (info.accepted.length === 0 || info.rejected.length > 0) {
            throw new Error(
                `[admin-order-notification] Email delivery was not accepted for all recipients. Accepted: ${info.accepted.length}; rejected: ${info.rejected.length}.`
            )
        }

        console.log("ADMIN NEW ORDER EMAIL SENT", {
            orderNumber: data.orderNumber,
            recipients,
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected,
        })

        return {
            success: true,
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected,
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        console.error("ADMIN NEW ORDER EMAIL FAILED", {
            orderNumber: data.orderNumber,
            recipients,
            error: message,
        })

        throw new Error(
            `[admin-order-notification] Failed to send new order email: ${message}`,
            { cause: error }
        )
    }
}
