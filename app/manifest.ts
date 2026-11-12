import type { MetadataRoute } from "next";

// Web app manifest (served at /manifest.webmanifest): lets phones install the
// app to the home screen and open it full-screen. Colours match the stone
// ground (--background) so the splash and status bar blend with the app.
// Icons come from scripts/generate-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "日本語 Vocab",
    short_name: "日本語 Vocab",
    description:
      "A calm, personal Japanese vocabulary study app with flashcards.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f5f3",
    theme_color: "#f6f5f3",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
