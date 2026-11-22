import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Abhas (আভাস) — Ward-Level Dengue Early Warning",
    short_name: "Abhas",
    description:
      "Rain today. Risk in three weeks. Act now. Bilingual 1–4 week dengue early-warning console for 60 wards across five Bangladesh city corporations.",
    start_url: "/",
    display: "standalone",
    background_color: "#000836",
    theme_color: "#001489",
    lang: "en",
    categories: ["health", "government", "utilities"],
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
    ],
  };
}
