import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShipDev — Human-Supervised AI Engineering IDE",
  description: "Autonomous multi-agent bug triage and verification workspace powered by Switch and Clay design system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-clay-canvas text-clay-ink font-sans antialiased min-h-screen overflow-hidden selection:bg-clay-lavender/40 selection:text-clay-ink">
        {children}
      </body>
    </html>
  );
}
