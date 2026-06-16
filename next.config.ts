import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow tunnel hosts (ngrok, etc.) to load dev assets and HMR over HTTPS.
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.ngrok.app",
  ],
  // Keep these server-only parsing/export libs out of the bundler so their
  // dynamic requires (e.g. pdf-parse) and binary deps resolve at runtime.
  // unofficial-jisho-api/cheerio scrape Jisho server-side (Node runtime only).
  serverExternalPackages: [
    "pdf-parse",
    "mammoth",
    "xlsx",
    "unofficial-jisho-api",
    "cheerio",
    "kuroshiro",
    "kuroshiro-analyzer-kuromoji",
    "kuromoji",
  ],
};

export default nextConfig;
