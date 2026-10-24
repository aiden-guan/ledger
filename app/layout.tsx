import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { CONVEX_URL } from "@/lib/convex/config";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0e" },
  ],
};

export const metadata: Metadata = {
  title: "LedgerLens",
  description: "An autonomous investigator that finds where a small business is losing money, and proves it to the cent.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans text-foreground antialiased">
        <ConvexClientProvider url={CONVEX_URL}>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
