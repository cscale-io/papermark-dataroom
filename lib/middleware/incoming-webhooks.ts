import { NextRequest, NextResponse } from "next/server";

export default async function IncomingWebhookMiddleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const path = url.pathname;

  console.log(`[WebhookMW] path=${path}`);

  // Only handle /services/* paths
  if (path.startsWith("/services/")) {
    // Rewrite to /api/webhooks/services/*
    const rewritePath = `/api/webhooks${path}`;
    console.log(`[WebhookMW] Rewriting to ${rewritePath}`);
    url.pathname = rewritePath;

    return NextResponse.rewrite(url);
  }

  // Return 404 for all other paths
  console.log(`[WebhookMW] Not a /services/ path, returning 404`);
  url.pathname = "/404";
  return NextResponse.rewrite(url, { status: 404 });
}

export function isWebhookPath(host: string | null) {
  if (!process.env.NEXT_PUBLIC_WEBHOOK_BASE_HOST) {
    return false;
  }

  if (host === process.env.NEXT_PUBLIC_WEBHOOK_BASE_HOST) {
    return true;
  }

  return false;
}
