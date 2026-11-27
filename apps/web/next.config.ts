import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const staticAssetHeaders = [
  { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
];

const nextConfig: NextConfig = {
  // Allow E2E runs to use an isolated distDir (.next-e2e) alongside an open dev server (QA Q12).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The dev badge covers bottom-left map stamps in localhost demo recordings.
  devIndicators: false,
  poweredByHeader: false,
  compress: true,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    optimizePackageImports: [
      "recharts",
      "lucide-react",
      "@iconify/react",
      "@tanstack/react-query",
      "clsx",
    ],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/brand/:path*",
        headers: staticAssetHeaders,
      },
      {
        source: "/images/:path*",
        headers: staticAssetHeaders,
      },
      {
        source: "/vendor/:path*",
        headers: staticAssetHeaders,
      },
      {
        source: "/:file(favicon\\.svg|favicon\\.ico|favicon-16x16\\.png|favicon-32x32\\.png|apple-touch-icon\\.png)",
        headers: staticAssetHeaders,
      },
      {
        source: "/llms.txt",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
          { key: "Content-Type", value: "text/plain; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
