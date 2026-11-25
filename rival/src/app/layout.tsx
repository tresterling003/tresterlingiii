import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fredoka";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Christmas HQ", template: "%s · Christmas HQ" },
  description: "Your family's Christmas dashboard: wishlists, gift tracking, budgets, games and more.",
  applicationName: "Christmas HQ",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Christmas HQ", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};

export const viewport: Viewport = { themeColor: "#F2F3F5", width: "device-width", initialScale: 1, viewportFit: "cover" };

const themeBoot = `try{var t=localStorage.getItem('hq-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="snow" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
