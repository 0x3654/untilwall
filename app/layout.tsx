import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Until Wall - Life Calendar Wallpaper Generator",
  description: "Generate personalized life calendar wallpapers for your Apple devices",
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
