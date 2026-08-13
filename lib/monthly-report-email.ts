import nodemailer from "nodemailer"
import type SMTPTransport from "nodemailer/lib/smtp-transport"

type MonthlyReportEmail = {
    monthName: string
    year: number
    periodLabel: string
    filename: string
    attachment: Buffer
}

let transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null =
    null

function requireEnv(name: string) {
    const value = process.env[name]?.trim()

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`)
    }

    return value
}

function getRecipients() {
    const configuredRecipients =
        process.env.ADMIN_NOTIFICATION_EMAIL?.trim() ||
        process.env.ADMIN_ORDER_NOTIFICATION_EMAIL?.trim() ||
        process.env.ADMIN_EMAIL?.trim()

    if (!configuredRecipients) {
        throw new Error(
            "Missing admin recipient. Configure ADMIN_NOTIFICATION_EMAIL, ADMIN_ORDER_NOTIFICATION_EMAIL, or ADMIN_EMAIL."
        )
    }

    const recipients = configuredRecipients
        .split(",")
        .map((recipient) => recipient.trim())
        .filter(Boolean)

    if (recipients.length === 0) {
        throw new Error("Admin recipient configuration contains no email addresses.")
    }

    return recipients
}

function getTransporter() {
    if (transporter) return transporter

    const smtpPort = Number(process.env.SMTP_PORT?.trim() || "465")

    transporter = nodemailer.createTransport({
        host: requireEnv("SMTP_HOST"),
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
            user: requireEnv("SMTP_USER"),
            pass: requireEnv("SMTP_PASS"),
        },
    })

    return transporter
}

export async function sendMonthlyOrderReportEmail(report: MonthlyReportEmail) {
    const smtpUser = requireEnv("SMTP_USER")
    const recipients = getRecipients()
    const subject = `Rocket PressWire Monthly Order Report - ${report.monthName} ${report.year}`
    const text = [
        "Hello Admin,",
        "",
        "Attached is the monthly Rocket PressWire order report.",
        "",
        "Report Period:",
        report.periodLabel,
        "",
        "This report contains all orders created during this period.",
        "",
        "Regards,",
        "Rocket PressWire",
    ].join("\n")

    const info = await getTransporter().sendMail({
        from: `Rocket PressWire Reports <${smtpUser}>`,
        replyTo: smtpUser,
        to: recipients,
        subject,
        text,
        attachments: [
            {
                filename: report.filename,
                content: report.attachment,
                contentType:
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
        ],
    })

    if (info.accepted.length === 0 || info.rejected.length > 0) {
        throw new Error(
            `Email delivery was not accepted for all recipients. Accepted: ${info.accepted.length}; rejected: ${info.rejected.length}.`
        )
    }

    return {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
    }
}
