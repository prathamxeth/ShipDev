import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShipDev — Human-Supervised AI Engineering IDE",
  description: "Autonomous multi-agent bug triage and verification workspace powered by Switch",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`}>
      <body className="bg-oled-black text-slate-100 font-sans antialiased min-h-screen overflow-hidden selection:bg-blue-600/30 selection:text-blue-200">
        {children}
      </body>
    </html>
  );
}

