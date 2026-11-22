import type { Metadata } from "next";
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
import { AbhasChatWidget } from "@/features/chat/AbhasChatWidget";

export const metadata: Metadata = {
  title: "Abhas (আভাস) — Ward-Level Dengue Early Warning",
  description:
    "Rain today. Risk in three weeks. Act now. Multi-week rainfall lag forecasting for 60 wards across five Bangladesh city corporations.",
  openGraph: {
    title: "Abhas (আভাস) — Ward-Level Dengue Early Warning",
    description:
      "Turn this week's rain into a 1–4 week dengue forecast for 60 wards across Dhaka, Chattogram, Gazipur, and Narayanganj.",
    type: "website",
    locale: "en_US",
    alternateLocale: ["bn_BD"],
    siteName: "Abhas (আভাস)",
  },
  twitter: {
    card: "summary_large_image",
    title: "Abhas (আভাস) — Ward-Level Dengue Early Warning",
    description: "Rain today. Risk in three weeks. Act now. 60 wards across five Bangladesh city corporations.",
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
          <AbhasChatWidget />
        </AuthProvider>
      </body>
    </html>
  );
}
