import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Translate - Live Caption",
  description: "Live Caption EN + Live Translate VI"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
