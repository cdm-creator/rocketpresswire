import { google } from "googleapis";

export type PaidOrder = {
  orderDate: string;
  stripeSessionId: string;
  customerEmail: string;
  customerName: string;
  selectedProducts: string[];
  amountTotal: number;
  currency: string;
  paymentStatus: string;
};

export async function appendOrderToSheet(order: PaidOrder) {
  const spreadsheetId = getRequiredEnv("GOOGLE_SHEET_ID");
  const clientEmail = getRequiredEnv("GOOGLE_CLIENT_EMAIL");
  const privateKey = getRequiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Orders!A:H",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          order.orderDate,
          order.stripeSessionId,
          order.customerEmail,
          order.customerName,
          order.selectedProducts.join(", "),
          formatAmount(order.amountTotal),
          order.currency,
          order.paymentStatus,
        ],
      ],
    },
  });
}

function formatAmount(amountInMinorUnits: number) {
  return (amountInMinorUnits / 100).toFixed(2);
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}
