import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "RIVAL — Fitness & Habit Tracker", template: "%s · RIVAL" },
  description: "Your program, your habits, and a weekly score to beat. Every Move Counts. Every Week Matters.",
  applicationName: "RIVAL",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "RIVAL", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0E0F12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body className="min-h-dvh font-sans">{children}<PwaRegister /></body>
    </html>
  );
}
