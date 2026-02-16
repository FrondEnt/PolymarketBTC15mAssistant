import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BTC 15m Polymarket Dashboard",
  description: "Real-time BTC price and Polymarket prediction tracking",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
