import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/dashboard",
    "/brand",
    "/docs",
    "/about",
    "/security",
    "/status",
    "/contact",
    "/privacy",
    "/terms",
  ];
  const lastModified = new Date("2026-11-22T00:00:00Z");
  return routes.map((route) => ({
    url: `${BASE}${route}`,
    lastModified,
    changeFrequency: route === "" || route === "/dashboard" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/dashboard" ? 0.9 : 0.7,
  }));
}
