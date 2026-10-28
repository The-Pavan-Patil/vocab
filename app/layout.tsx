import type { Metadata, Viewport } from "next";
import { Geist, Noto_Sans_JP } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Self-hosted (next/font downloads it at build time) so kanji renders crisply
// and consistently everywhere. Google serves Noto Sans JP as ~100 small woff2
// slices by unicode-range, so a page only fetches the slices for the glyphs it
// shows — instead of the 9.6 MB TTF in public/fonts (still used server-side by
// the PDF export). No subset is preloaded: Japanese text is never the first
// paint, and swap shows the fallback until the slices arrive.
const notoSansJP = Noto_Sans_JP({
  variable: "--font-jp",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "日本語 Vocab — Japanese Study",
  description: "A calm, personal Japanese vocabulary study app with flashcards.",
};

// Light-only theme: tell the browser (form controls, scrollbars) and match the
// mobile browser chrome to the stone background (--background).
export const viewport: Viewport = {
  themeColor: "#f6f5f3",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${notoSansJP.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Lifted clear of the fixed mobile bottom nav (--app-nav-clearance,
            globals.css) so a toast never covers it. */}
        <Toaster
          position="bottom-center"
          offset={{ bottom: "calc(var(--app-nav-clearance) + 24px)" }}
          mobileOffset={{ bottom: "calc(var(--app-nav-clearance) + 16px)" }}
        />
      </body>
    </html>
  );
}
