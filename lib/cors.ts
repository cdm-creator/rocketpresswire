import { NextRequest } from "next/server";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function getCorsHeaders(request: NextRequest): Record<string, string> {
  const configuredFrontendUrl = process.env.FRONTEND_URL;
  const requestOrigin = request.headers.get("origin");

  const allowedOrigin =
    configuredFrontendUrl && requestOrigin === configuredFrontendUrl
      ? configuredFrontendUrl
      : configuredFrontendUrl ?? "*";

  return {
    ...corsHeaders,
    "Access-Control-Allow-Origin": allowedOrigin,
    Vary: "Origin",
  };
}
