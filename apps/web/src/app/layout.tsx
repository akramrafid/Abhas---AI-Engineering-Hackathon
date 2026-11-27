import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import "@fontsource/poppins/300.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "@fontsource/noto-sans-bengali/400.css";
import "@fontsource/noto-sans-bengali/600.css";
import "@fontsource/noto-sans-bengali/700.css";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { CookieBanner } from "@/components/layout/CookieBanner";
import { LazyChatWidget } from "@/features/chat/LazyChatWidget";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#001489" },
    { media: "(prefers-color-scheme: dark)", color: "#000836" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Ward-Level Dengue Early Warning`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "Public Health & Epidemiology",
  keywords: [
    "Abhas",
    "আভাস",
    "dengue early warning Bangladesh",
    "ward-level dengue forecast",
    "Dhaka dengue forecast",
    "Chattogram dengue early warning",
    "DNCC DSCC dengue prediction",
    "rainfall lag dengue model",
    "Bangladesh public health AI",
    "LightGBM dengue surveillance",
  ],
  authors: [{ name: "Abhas Team", url: SITE_URL }],
  creator: "Abhas Team",
  publisher: SITE_NAME,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: `${SITE_NAME} — Ward-Level Dengue Early Warning`,
    description:
      "Turn this week's rain into a 1–4 week dengue forecast for 60 wards across Dhaka North, Dhaka South, Chattogram, Gazipur, and Narayanganj.",
    url: "/",
    type: "website",
    locale: "en_US",
    alternateLocale: ["bn_BD"],
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Ward-Level Dengue Early Warning`,
    description:
      "Rain today. Risk in three weeks. Act now. 60 wards across five Bangladesh city corporations.",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased scroll-smooth" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-paper text-ink font-sans" suppressHydrationWarning>
        <AuthProvider>
          {children}
          <Suspense fallback={null}>
            <CookieBanner />
          </Suspense>
          <LazyChatWidget />
        </AuthProvider>
      </body>
    </html>
  );
}
