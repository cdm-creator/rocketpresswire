import nodemailer from "nodemailer"
import type SMTPTransport from "nodemailer/lib/smtp-transport"

let transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null =
    null

function requireEnv(name: string) {
    const value = process.env[name]?.trim()

    if (!value) {
        throw new Error(
            `[release-email-verification] Missing required environment variable: ${name}`
        )
    }

    return value
}

function getTransporter() {
    if (transporter) return transporter

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

export async function sendReleaseEmailVerificationCode(
    email: string,
    code: string
) {
    const smtpUser = requireEnv("SMTP_USER")

    await getTransporter().sendMail({
        from: {
            name: "Rocket PressWire",
            address: smtpUser,
        },
        replyTo: smtpUser,
        to: email,
        subject: "Verify your Rocket PressWire contact email",
        text: `Your Rocket PressWire verification code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
        html: `<!doctype html><html><body style="margin:0;background:#0b0b0f;color:#ffffff;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:40px 24px"><h1 style="font-size:24px;margin:0 0 16px">Verify your contact email</h1><p style="color:#c8c5d1;line-height:1.6">Use this code to verify the contact email for your Rocket PressWire release:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:20px 0">${code}</div><p style="color:#c8c5d1;line-height:1.6">This code expires in 10 minutes and can be used once.</p></div></body></html>`,
    })
}
