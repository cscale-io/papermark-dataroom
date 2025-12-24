import { NextRequest, NextResponse } from "next/server";

import { getToken } from "next-auth/jwt";

const VERCEL_DEPLOYMENT = !!process.env.VERCEL_URL;

export default async function AppMiddleware(req: NextRequest) {
  const url = req.nextUrl;
  const path = url.pathname;
  const isInvited = url.searchParams.has("invitation");
  
  const cookieName = VERCEL_DEPLOYMENT
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
  
  const token = (await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: VERCEL_DEPLOYMENT,
    cookieName,
  })) as {
    email?: string;
    user?: {
      createdAt?: string;
    };
  };

  const hasCookie = !!req.cookies.get(cookieName);
  const allCookies = req.cookies.getAll().map(c => c.name);
  const hasSecret = !!process.env.NEXTAUTH_SECRET;
  console.log(`[AppMW] === APP MIDDLEWARE ===`);
  console.log(`[AppMW] path=${path}, VERCEL_DEPLOYMENT=${VERCEL_DEPLOYMENT}`);
  console.log(`[AppMW] cookieName=${cookieName}, hasCookie=${hasCookie}, hasSecret=${hasSecret}`);
  console.log(`[AppMW] allCookies=${JSON.stringify(allCookies)}`);
  console.log(`[AppMW] tokenEmail=${token?.email}, tokenSub=${(token as any)?.sub}`);

  // UNAUTHENTICATED if there's no token and the path isn't /login, redirect to /login
  if (!token?.email && path !== "/login") {
    console.log(`[AppMW] UNAUTHENTICATED, redirecting to /login`);
    const loginUrl = new URL(`/login`, req.url);
    // Append "next" parameter only if not navigating to the root
    if (path !== "/") {
      const nextPath =
        path === "/auth/confirm-email-change" ? `${path}${url.search}` : path;

      loginUrl.searchParams.set("next", encodeURIComponent(nextPath));
    }
    return NextResponse.redirect(loginUrl);
  }

  // AUTHENTICATED if the user was created in the last 10 seconds, redirect to "/welcome"
  if (
    token?.email &&
    token?.user?.createdAt &&
    new Date(token?.user?.createdAt).getTime() > Date.now() - 10000 &&
    path !== "/welcome" &&
    !isInvited
  ) {
    return NextResponse.redirect(new URL("/welcome", req.url));
  }

  // AUTHENTICATED if the path is /login, redirect to "/dashboard"
  if (token?.email && path === "/login") {
    const nextPath = url.searchParams.get("next") || "/dashboard"; // Default redirection to "/dashboard" if no next parameter
    console.log(`[AppMW] AUTHENTICATED on /login, redirecting to ${nextPath}`);
    return NextResponse.redirect(
      new URL(decodeURIComponent(nextPath), req.url),
    );
  }

  console.log(`[AppMW] Passing through with NextResponse.next()`);
  return NextResponse.next();
}
