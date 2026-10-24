import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { CONVEX_URL } from "@/lib/convex/config";
import "./globals.css";

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e10" },
  ],
};

export const metadata: Metadata = {
  title: "LedgerLens",
  description: "LedgerLens finds where your business is leaking profit, gathers the evidence, and prepares the fix for your approval.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen font-sans text-foreground antialiased">
        <ConvexClientProvider url={CONVEX_URL}>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
