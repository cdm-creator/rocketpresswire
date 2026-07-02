import nodemailer from "nodemailer";
import { Resend } from "resend";
import type { PaidOrder } from "@/lib/googleSheets";

export async function sendAdminOrderEmail(order: PaidOrder) {
  const adminEmail = getRequiredEnv("ADMIN_EMAIL");
  const from = process.env.EMAIL_FROM ?? process.env.SMTP_FROM ?? adminEmail;
  const subject = "New Paid Distribution Order";
  const text = buildTextBody(order);
  const html = buildHtmlBody(order);

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from,
      to: adminEmail,
      subject,
      text,
      html,
    });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: getRequiredEnv("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT ?? "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: getRequiredEnv("SMTP_USER"),
      pass: getRequiredEnv("SMTP_PASS"),
    },
  });

  await transporter.sendMail({
    from,
    to: adminEmail,
    subject,
    text,
    html,
  });
}

function buildTextBody(order: PaidOrder) {
  return [
    "New paid distribution order received.",
    "",
    `Customer email: ${order.customerEmail || "Not provided"}`,
    `Customer name: ${order.customerName || "Not provided"}`,
    `Selected products: ${order.selectedProducts.join(", ") || "None"}`,
    `Amount paid: ${formatCurrency(order.amountTotal, order.currency)}`,
    `Stripe session ID: ${order.stripeSessionId}`,
    `Payment status: ${order.paymentStatus}`,
  ].join("\n");
}

function buildHtmlBody(order: PaidOrder) {
  return `
    <h2>New paid distribution order received.</h2>
    <p><strong>Customer email:</strong> ${escapeHtml(order.customerEmail || "Not provided")}</p>
    <p><strong>Customer name:</strong> ${escapeHtml(order.customerName || "Not provided")}</p>
    <p><strong>Selected products:</strong> ${escapeHtml(order.selectedProducts.join(", ") || "None")}</p>
    <p><strong>Amount paid:</strong> ${escapeHtml(formatCurrency(order.amountTotal, order.currency))}</p>
    <p><strong>Stripe session ID:</strong> ${escapeHtml(order.stripeSessionId)}</p>
    <p><strong>Payment status:</strong> ${escapeHtml(order.paymentStatus)}</p>
  `;
}

function formatCurrency(amountInMinorUnits: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(amountInMinorUnits / 100);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}
