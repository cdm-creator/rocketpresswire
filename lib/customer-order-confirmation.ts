import nodemailer from "nodemailer"
import type SMTPTransport from "nodemailer/lib/smtp-transport"

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

type CustomerOrderCompletionEmailData = {
    orderNumber: string
    customerName?: string | null
    customerEmail: string
}

export type FreeReleaseCompletionEmailData = {
    customerName?: string | null
    customerEmail: string
    releaseId: string
    releaseTitle: string
    publishedUrl?: string | null
    reportFile?: string | null
}

let transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null =
    null

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

function getGreeting(customerName: string | null | undefined) {
    const name = customerName?.trim()

    return name ? `Hi ${name},` : "Hello,"
}

function buildTextEmail(
    data: CustomerOrderConfirmationEmailData,
    portalUrl: string
) {
    const products = data.products.map((product) => `- ${formatProduct(product)}`)
    return [
        "ROCKET PRESSWIRE",
        "",
        "Thank You for Your Order",
        "",
        getGreeting(data.customerName),
        "",
        "Thank you for choosing Rocket PressWire.",
        "",
        "Your payment was successful and your order has been confirmed.",
        "Our team will begin processing your distribution before that please submit your press release content.",
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
        "Go to Your Dashboard:",
        portalUrl,
        "",
        "Thank you for your order.",
        "",
        "Rocket PressWire Team",
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
                <div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#9d8eff;">ROCKET PRESSWIRE</div>
                <h1 style="margin:18px 0 14px;font-size:28px;line-height:1.2;color:#ffffff;">Thank You for Your Order</h1>
                <p style="margin:0 0 14px;color:#ffffff;font-size:16px;line-height:1.55;">${escapeHtml(
                    getGreeting(data.customerName)
                )}</p>
                <p style="margin:0;color:#aaa4bd;font-size:16px;line-height:1.55;">Thank you for choosing Rocket PressWire. Your payment was successful and your order has been confirmed. Our team will begin processing your distribution before that please submit your press release content.</p>
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
                <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#765eff;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 20px;border-radius:8px;">Go to Your Dashboard</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 32px;">
                <p style="margin:0;color:#aaa4bd;font-size:14px;line-height:1.5;">Thank you for your order.<br />Rocket PressWire Team</p>
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

function buildCompletionTextEmail(
    data: CustomerOrderCompletionEmailData,
    portalUrl: string
) {
    return [
        "ROCKET PRESSWIRE",
        "",
        "Your Order Is Completed",
        "",
        getGreeting(data.customerName),
        "",
        `Your Rocket PressWire order ${data.orderNumber} has been completed.`,
        "",
        "You can check your report and the latest order details in your dashboard.",
        "",
        "View your report in the dashboard:",
        portalUrl,
        "",
        "Thank you for choosing Rocket PressWire.",
        "",
        "Rocket PressWire Team",
    ].join("\n")
}

function buildCompletionHtmlEmail(
    data: CustomerOrderCompletionEmailData,
    portalUrl: string
) {
    return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Your Order Is Completed</title>
  </head>
  <body style="margin:0;padding:0;background:#07031d;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07031d;margin:0;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#17102f;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 28px 12px;">
                <div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#9d8eff;">ROCKET PRESSWIRE</div>
                <h1 style="margin:18px 0 14px;font-size:28px;line-height:1.2;color:#ffffff;">Your Order Is Completed 🚀</h1>
                <p style="margin:0 0 14px;color:#ffffff;font-size:16px;line-height:1.55;">${escapeHtml(
                    getGreeting(data.customerName)
                )}</p>
                <p style="margin:0;color:#aaa4bd;font-size:16px;line-height:1.55;">Your Rocket PressWire order <strong style="color:#ffffff;">${escapeHtml(
                    data.orderNumber
                )}</strong> has been completed.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 8px;">
                <p style="margin:0;color:#aaa4bd;font-size:15px;line-height:1.55;">You can check your report and the latest order details in your dashboard.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 12px;">
                <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#765eff;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 20px;border-radius:8px;">View Report in Your Dashboard</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 32px;">
                <p style="margin:0;color:#aaa4bd;font-size:14px;line-height:1.5;">Thank you for choosing Rocket PressWire.<br />Rocket PressWire Team</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function buildFreeReleaseCompletionTextEmail(
    data: FreeReleaseCompletionEmailData,
    portalUrl: string
) {
    return [
        "ROCKET PRESSWIRE",
        "",
        "Your Free Release Has Been Completed",
        "",
        getGreeting(data.customerName),
        "",
        "Your free press release has been completed successfully.",
        "",
        "Release ID:",
        data.releaseId,
        "",
        "Release Title:",
        data.releaseTitle,
        "",
        "Status:",
        "Completed",
        ...(data.publishedUrl
            ? ["", "Published URL:", data.publishedUrl]
            : []),
        ...(data.reportFile ? ["", "Report:", data.reportFile] : []),
        "",
        "You can access your release details, report, and published URL from your customer portal.",
        "",
        "Customer Portal:",
        portalUrl,
        "",
        "Thank you for using Rocket Press Wire.",
        "",
        "Rocket PressWire Team",
    ].join("\n")
}

function buildFreeReleaseCompletionHtmlEmail(
    data: FreeReleaseCompletionEmailData,
    portalUrl: string
) {
    const optionalPublishedUrl = data.publishedUrl
        ? `<tr>
      <td style="padding:12px 0;border-bottom:1px solid #2b2440;">
        <div style="color:#aaa4bd;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Published URL</div>
        <div style="margin-top:6px;font-size:15px;line-height:1.55;overflow-wrap:anywhere;word-break:break-word;"><a href="${escapeHtml(data.publishedUrl)}" style="color:#b9adff;text-decoration:underline;">View published release</a></div>
      </td>
    </tr>`
        : ""
    const optionalReport = data.reportFile
        ? `<tr>
      <td style="padding:12px 0;border-bottom:1px solid #2b2440;">
        <div style="color:#aaa4bd;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Report</div>
        <div style="margin-top:6px;font-size:15px;line-height:1.55;overflow-wrap:anywhere;word-break:break-word;"><a href="${escapeHtml(data.reportFile)}" style="color:#b9adff;text-decoration:underline;">View report</a></div>
      </td>
    </tr>`
        : ""

    return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Your Free Release Has Been Completed</title>
  </head>
  <body style="margin:0;padding:0;background:#07031d;color:#ffffff;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#07031d;margin:0;border-collapse:collapse;table-layout:fixed;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#17102f;border-collapse:separate;border-spacing:0;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 28px 12px;">
                <div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#9d8eff;">ROCKET PRESSWIRE</div>
                <h1 style="margin:18px 0 14px;font-size:27px;line-height:1.25;color:#ffffff;overflow-wrap:anywhere;word-break:break-word;">Your Free Release Has Been Completed</h1>
                <p style="margin:0 0 14px;color:#ffffff;font-size:16px;line-height:1.55;">${escapeHtml(getGreeting(data.customerName))}</p>
                <p style="margin:0;color:#aaa4bd;font-size:16px;line-height:1.55;">Your free press release has been completed successfully.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;">
                  ${buildHtmlRow("Release ID", data.releaseId)}
                  ${buildHtmlRow("Release Title", data.releaseTitle)}
                  ${buildHtmlRow("Status", "Completed")}
                  ${optionalPublishedUrl}
                  ${optionalReport}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 8px;">
                <p style="margin:0;color:#aaa4bd;font-size:15px;line-height:1.55;overflow-wrap:anywhere;word-break:break-word;">You can access your release details, report, and published URL from your customer portal.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 12px;">
                <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#765eff;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 20px;border-radius:8px;">Open Customer Portal</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 32px;">
                <p style="margin:0;color:#aaa4bd;font-size:14px;line-height:1.5;">Thank you for using Rocket Press Wire.<br />Rocket PressWire Team</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function getTransporter() {
    if (transporter) {
        return transporter
    }

    const smtpUser = requireEnv("SMTP_USER")
    const smtpPassword = requireEnv("SMTP_PASS")
    const smtpHost = process.env.SMTP_HOST?.trim() || "smtp.hostinger.com"
    const smtpPort = Number(process.env.SMTP_PORT?.trim() || "465")

    transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
            user: smtpUser,
            pass: smtpPassword,
        },
    })

    return transporter
}

function getPortalUrl() {
    return (
        process.env.SITE_PORTAL_URL?.trim() ||
        "https://rocketpresswire.com/portal"
    )
}

export async function sendCustomerOrderConfirmationEmail(
    data: CustomerOrderConfirmationEmailData
) {
    const smtpUser = requireEnv("SMTP_USER")

    const portalUrl = getPortalUrl()

    const customerEmail = data.customerEmail.trim().toLowerCase()

    if (!customerEmail) {
        throw new Error(
            "[customer-order-confirmation] Customer email is missing."
        )
    }

    try {
        const info = await getTransporter().sendMail({
            from: {
                name: "Rocket PressWire",
                address: smtpUser,
            },
            replyTo: smtpUser,
            to: customerEmail,
            subject: `Your Rocket PressWire Order Is Confirmed - ${data.orderNumber}`,
            text: buildTextEmail(data, portalUrl),
            html: buildHtmlEmail(data, portalUrl),
        })

        console.log("CUSTOMER CONFIRMATION EMAIL SENT", {
            orderNumber: data.orderNumber,
            customerEmail,
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
        console.error("CUSTOMER CONFIRMATION EMAIL FAILED", {
            orderNumber: data.orderNumber,
            customerEmail,
            error:
                error instanceof Error
                    ? error.message
                    : String(error),
        })

        throw error
    }
}

export async function sendCustomerOrderCompletionEmail(
    data: CustomerOrderCompletionEmailData
) {
    const smtpUser = requireEnv("SMTP_USER")
    const portalUrl = getPortalUrl()
    const customerEmail = data.customerEmail.trim().toLowerCase()

    if (!customerEmail) {
        throw new Error(
            "[customer-order-completion] Customer email is missing."
        )
    }

    try {
        const info = await getTransporter().sendMail({
            from: {
                name: "Rocket PressWire",
                address: smtpUser,
            },
            replyTo: smtpUser,
            to: customerEmail,
            subject: "Your Rocket PressWire Order Is Completed 🚀",
            text: buildCompletionTextEmail(data, portalUrl),
            html: buildCompletionHtmlEmail(data, portalUrl),
        })

        console.log("CUSTOMER COMPLETION EMAIL SENT", {
            orderNumber: data.orderNumber,
            customerEmail,
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
        console.error("CUSTOMER COMPLETION EMAIL FAILED", {
            orderNumber: data.orderNumber,
            customerEmail,
            error: error instanceof Error ? error.message : String(error),
        })

        throw error
    }
}

export async function sendFreeReleaseCompletionEmail(
    data: FreeReleaseCompletionEmailData
) {
    const smtpUser = requireEnv("SMTP_USER")
    const portalUrl = getPortalUrl()
    const customerEmail = data.customerEmail.trim().toLowerCase()

    if (!customerEmail) {
        throw new Error(
            "[free-release-completion] Customer email is missing."
        )
    }

    try {
        const info = await getTransporter().sendMail({
            from: {
                name: "Rocket PressWire",
                address: smtpUser,
            },
            replyTo: smtpUser,
            to: customerEmail,
            subject: "Your Free Release Has Been Completed",
            text: buildFreeReleaseCompletionTextEmail(data, portalUrl),
            html: buildFreeReleaseCompletionHtmlEmail(data, portalUrl),
        })

        console.log("FREE RELEASE COMPLETION EMAIL SENT", {
            releaseId: data.releaseId,
            customerEmail,
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
        console.error("FREE RELEASE COMPLETION EMAIL FAILED", {
            releaseId: data.releaseId,
            customerEmail,
            error: error instanceof Error ? error.message : String(error),
        })

        throw error
    }
}
