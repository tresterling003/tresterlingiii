import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Classroom HQ",
  description: "Your teaching dashboard — lessons, resources, and grading for every class.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
