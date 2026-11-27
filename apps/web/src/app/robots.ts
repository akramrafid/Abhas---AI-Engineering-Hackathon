import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

const PUBLIC_ALLOW = ["/", "/llms.txt"];
const PRIVATE_DISALLOW = ["/api/", "/sign-in/", "/sign-up/", "/thank-you/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      // Explicitly welcome search and AI answer/citation crawlers (GEO & AEO).
      {
        userAgent: [
          "Googlebot",
          "Bingbot",
          "OAI-SearchBot",
          "GPTBot",
          "ClaudeBot",
          "PerplexityBot",
          "Applebot",
        ],
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
