import type { AppProps } from "next/app";
import { Inter } from "next/font/google";
import Head from "next/head";

import { TeamProvider } from "@/context/team-context";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { NuqsAdapter } from "nuqs/adapters/next/pages";

import { EXCLUDED_PATHS } from "@/lib/constants";

import { PostHogCustomProvider } from "@/components/providers/posthog-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"] });

export default function App({
  Component,
  pageProps: { session, ...pageProps },
  router,
}: AppProps<{ session: Session }>) {
  return (
    <>
      <Head>
        <title>C.Scale Data Room</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#000000" />
        <meta
          name="description"
          content="C.Scale Data Room - Secure document sharing with real-time analytics."
          key="description"
        />
        <meta
          property="og:title"
          content="C.Scale Data Room"
          key="og-title"
        />
        <meta
          property="og:description"
          content="C.Scale Data Room - Secure document sharing with real-time analytics."
          key="og-description"
        />
        <meta
          property="og:image"
          content={`${process.env.NEXT_PUBLIC_BASE_URL}/_static/meta-image.png`}
          key="og-image"
        />
        <meta
          property="og:url"
          content={process.env.NEXT_PUBLIC_BASE_URL}
          key="og-url"
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@caborncapital" />
        <meta name="twitter:creator" content="@caborncapital" />
        <meta name="twitter:title" content="C.Scale" key="tw-title" />
        <meta
          name="twitter:description"
          content="C.Scale Data Room - Secure document sharing with real-time analytics."
          key="tw-description"
        />
        <meta
          name="twitter:image"
          content={`${process.env.NEXT_PUBLIC_BASE_URL}/_static/meta-image.png`}
          key="tw-image"
        />
        <link rel="icon" href="/favicon.ico" key="favicon" />
      </Head>
      <SessionProvider session={session}>
        <PostHogCustomProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
            <NuqsAdapter>
              <main className={inter.className}>
                <Toaster closeButton />
                <TooltipProvider delayDuration={100}>
                  {EXCLUDED_PATHS.includes(router.pathname) ? (
                    <Component {...pageProps} />
                  ) : (
                    <TeamProvider>
                      <Component {...pageProps} />
                    </TeamProvider>
                  )}
                </TooltipProvider>
              </main>
            </NuqsAdapter>
          </ThemeProvider>
        </PostHogCustomProvider>
      </SessionProvider>
    </>
  );
}
