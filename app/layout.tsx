import { Metadata } from "next";
import localFont from "next/font/local";

import "@/styles/globals.css";

const circularStd = localFont({
  src: [
    { path: "../public/fonts/CircularStd-Light.otf", weight: "300", style: "normal" },
    { path: "../public/fonts/CircularStd-Light Italic.otf", weight: "300", style: "italic" },
    { path: "../public/fonts/CircularStd-Book.otf", weight: "400", style: "normal" },
    { path: "../public/fonts/CircularStd-BookItalic.otf", weight: "400", style: "italic" },
    { path: "../public/fonts/CircularStd-Medium.otf", weight: "500", style: "normal" },
    { path: "../public/fonts/CircularStd-MediumItalic.otf", weight: "500", style: "italic" },
    { path: "../public/fonts/CircularStd-Bold.otf", weight: "700", style: "normal" },
    { path: "../public/fonts/CircularStd-BoldItalic.otf", weight: "700", style: "italic" },
    { path: "../public/fonts/CircularStd-Black.otf", weight: "900", style: "normal" },
    { path: "../public/fonts/CircularStd-BlackItalic.otf", weight: "900", style: "italic" },
  ],
  variable: "--font-circular",
});

const data = {
  description:
    "C.Scale Data Room - Secure document sharing with real-time analytics.",
  title: "C.Scale Data Room",
  url: "/",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
  title: data.title,
  description: data.description,
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: data.title,
    description: data.description,
    url: data.url,
    siteName: "C.Scale",
    images: [
      {
        url: "/_static/meta-image.png",
        width: 800,
        height: 600,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: data.title,
    description: data.description,
    creator: "@caborncapital",
    images: ["/_static/meta-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={circularStd.variable}>
      <body className={circularStd.className}>{children}</body>
    </html>
  );
}
