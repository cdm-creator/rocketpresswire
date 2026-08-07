import nodemailer from "nodemailer"
import type SMTPTransport from "nodemailer/lib/smtp-transport"

export type AdminReleaseSubmissionEmailData = {
    orderNumber: string
    customerName?: string | null
    customerEmail: string
    releaseTitle?: string | null
    outletNames: string[]
    submittedAt: string
}

let transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null =
    null

function requireEnv(name: string) {
    const value = process.env[name]?.trim()

    if (!value) {
        const message = `[admin-release-notification] Missing required environment variable: ${name}`
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
            "[admin-release-notification] Missing admin recipient. Configure ADMIN_NOTIFICATION_EMAIL, ADMIN_ORDER_NOTIFICATION_EMAIL, or ADMIN_EMAIL."
        )
    }

    const recipients = configuredRecipients
        .split(",")
        .map((recipient) => recipient.trim())
        .filter(Boolean)

    if (recipients.length === 0) {
        throw new Error(
            "[admin-release-notification] Admin recipient configuration contains no email addresses."
        )
    }

    return recipients
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

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

function formatSubmissionDate(value: string) {
    return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
    }).format(new Date(value))
}

function buildTextEmail(
    data: AdminReleaseSubmissionEmailData,
    adminUrl: string
) {
    const customerName = data.customerName?.trim() || "Not provided"
    const releaseTitle = data.releaseTitle?.trim() || "Not provided"
    const outlets = data.outletNames.map((outlet) => `- ${outlet}`)

    return [
        "ROCKET PRESSWIRE",
        "",
        "New Release Submitted",
        "",
        "A customer has submitted a new press release.",
        "",
        "Order Number:",
        data.orderNumber,
        "",
        "Release Title:",
        releaseTitle,
        "",
        "Customer:",
        customerName,
        "",
        "Customer Email:",
        data.customerEmail,
        "",
        "Selected Outlets:",
        ...(outlets.length > 0 ? outlets : ["- No outlets listed"]),
        "",
        "Submission Date:",
        formatSubmissionDate(data.submittedAt),
        "",
        "Open Admin Dashboard:",
        adminUrl,
    ].join("\n")
}

function buildHtmlRow(label: string, value: string) {
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
        <div style="color:#aaa4bd;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(label)}</div>
        <div style="margin-top:5px;color:#ffffff;font-size:16px;line-height:1.45;">${escapeHtml(value)}</div>
      </td>
    </tr>`
}

function buildHtmlEmail(
    data: AdminReleaseSubmissionEmailData,
    adminUrl: string
) {
    const customerName = data.customerName?.trim() || "Not provided"
    const releaseTitle = data.releaseTitle?.trim() || "Not provided"
    const outletItems =
        data.outletNames.length > 0
            ? data.outletNames
                  .map(
                      (outlet) =>
                          `<li style="margin:0 0 8px;color:#ffffff;">${escapeHtml(outlet)}</li>`
                  )
                  .join("")
            : '<li style="margin:0 0 8px;color:#ffffff;">No outlets listed</li>'

    return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>New Release Submitted</title>
  </head>
  <body style="margin:0;padding:0;background:#07031d;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07031d;margin:0;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#17102f;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 28px 16px;">
                <div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#aaa4bd;">ROCKET PRESSWIRE</div>
                <h1 style="margin:18px 0 10px;font-size:28px;line-height:1.2;color:#ffffff;">New Release Submitted</h1>
                <p style="margin:0;color:#aaa4bd;font-size:16px;line-height:1.55;">A customer has submitted a new press release.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 4px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  ${buildHtmlRow("Order Number", data.orderNumber)}
                  ${buildHtmlRow("Release Title", releaseTitle)}
                  ${buildHtmlRow("Customer", customerName)}
                  ${buildHtmlRow("Customer Email", data.customerEmail)}
                  ${buildHtmlRow("Submission Date", formatSubmissionDate(data.submittedAt))}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 28px 8px;">
                <div style="margin:0 0 10px;color:#aaa4bd;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Selected Outlets</div>
                <ul style="margin:0;padding:0 0 0 18px;">${outletItems}</ul>
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

export async function sendAdminReleaseSubmissionEmail(
    data: AdminReleaseSubmissionEmailData
) {
    let recipients: string[] = []

    try {
        const smtpUser = requireEnv("SMTP_USER")
        requireEnv("SMTP_PASS")
        recipients = getAdminRecipients()

        const adminUrl =
            process.env.SITE_ADMIN_URL?.trim() ||
            "https://rocketpresswire.com/admin"

        const info = await getTransporter().sendMail({
            from: `Rocket PressWire Releases <${smtpUser}>`,
            replyTo: smtpUser,
            to: recipients,
            subject: `New Release Submitted - ${data.orderNumber}`,
            text: buildTextEmail(data, adminUrl),
            html: buildHtmlEmail(data, adminUrl),
        })

        if (info.accepted.length === 0 || info.rejected.length > 0) {
            throw new Error(
                `[admin-release-notification] Email delivery was not accepted for all recipients. Accepted: ${info.accepted.length}; rejected: ${info.rejected.length}.`
            )
        }

        console.log("ADMIN NEW RELEASE EMAIL SENT", {
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

        console.error("ADMIN NEW RELEASE EMAIL FAILED", {
            orderNumber: data.orderNumber,
            recipients,
            error: message,
        })

        throw new Error(
            `[admin-release-notification] Failed to send new release email: ${message}`,
            { cause: error }
        )
    }
}
