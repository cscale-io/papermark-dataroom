import { Metadata } from "next";
import { Inter } from "next/font/google";

import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"] });

const data = {
  description:
    "C.Scale Data Room - Secure document sharing with real-time analytics.",
  title: "C.Scale Data Room",
  url: "/",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://dataroom.cscale.io"),
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
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
