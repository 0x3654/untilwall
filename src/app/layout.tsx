import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Until Wall",
  description: "Generate personalized life calendar wallpapers for your Apple devices",
  robots: "noindex, nofollow, nosnippet, noarchive, notranslate, noimageindex",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
