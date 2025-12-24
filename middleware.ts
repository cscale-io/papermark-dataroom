import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

import AppMiddleware from "@/lib/middleware/app";
import DomainMiddleware from "@/lib/middleware/domain";

import { BLOCKED_PATHNAMES } from "./lib/constants";
import IncomingWebhookMiddleware, {
  isWebhookPath,
} from "./lib/middleware/incoming-webhooks";
import PostHogMiddleware from "./lib/middleware/posthog";

function isAnalyticsPath(path: string) {
  // Create a regular expression
  // ^ - asserts position at start of the line
  // /ingest/ - matches the literal string "/ingest/"
  // .* - matches any character (except for line terminators) 0 or more times
  const pattern = /^\/ingest\/.*/;

  return pattern.test(path);
}

function isCustomDomain(host: string) {
  // For C.Scale fork: single domain deployment, no custom domains needed
  // Custom domains would be any domain NOT matching the main app domain
  return (
    (process.env.NODE_ENV === "development" &&
      (host?.includes(".local"))) ||
    (process.env.NODE_ENV !== "development" &&
      !(
        host?.includes("localhost") ||
        host?.includes("cscale.io") ||
        host?.endsWith(".vercel.app")
      ))
  );
}

export const config = {
  matcher: [
    /*
     * Match all paths except for:
     * 1. /api/ routes
     * 2. /_next/ (Next.js internals)
     * 3. /_static (inside /public)
     * 4. /_vercel (Vercel internals)
     * 5. /favicon.ico, /sitemap.xml (static files)
     */
    "/((?!api/|_next/|_static|vendor|_icons|_vercel|favicon.ico|sitemap.xml).*)",
  ],
};

export default async function middleware(req: NextRequest, ev: NextFetchEvent) {
  const path = req.nextUrl.pathname;
  const host = req.headers.get("host");
  const webhookHost = process.env.NEXT_PUBLIC_WEBHOOK_BASE_HOST;
  const vercelUrl = process.env.VERCEL_URL;
  const nodeEnv = process.env.NODE_ENV;

  console.log(`[MW] === MIDDLEWARE START ===`);
  console.log(`[MW] path=${path}, host=${host}`);
  console.log(`[MW] env: NODE_ENV=${nodeEnv}, VERCEL_URL=${vercelUrl}, WEBHOOK_HOST=${webhookHost}`);
  console.log(`[MW] checks: isWebhook=${isWebhookPath(host)}, isCustomDomain=${isCustomDomain(host || "")}, isAnalytics=${isAnalyticsPath(path)}`);

  if (isAnalyticsPath(path)) {
    console.log(`[MW] Routing to PostHogMiddleware`);
    return PostHogMiddleware(req);
  }

  // Handle incoming webhooks
  if (isWebhookPath(host)) {
    console.log(`[MW] Routing to IncomingWebhookMiddleware`);
    return IncomingWebhookMiddleware(req);
  }

  // For custom domains, we need to handle them differently
  if (isCustomDomain(host || "")) {
    console.log(`[MW] Routing to DomainMiddleware`);
    return DomainMiddleware(req);
  }

  // Handle standard app paths
  if (
    !path.startsWith("/view/") &&
    !path.startsWith("/verify") &&
    !path.startsWith("/unsubscribe")
  ) {
    console.log(`[MW] Routing to AppMiddleware`);
    return AppMiddleware(req);
  }

  // Check for blocked pathnames in view routes
  if (
    path.startsWith("/view/") &&
    (BLOCKED_PATHNAMES.some((blockedPath) => path.includes(blockedPath)) ||
      path.includes("."))
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/404";
    return NextResponse.rewrite(url, { status: 404 });
  }

  return NextResponse.next();
}
