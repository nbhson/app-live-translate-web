import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Translate - Live Caption",
  description: "Live Caption EN + Live Translate VI"
};

// Theme bootstrap runs before first paint (no FOUC): default is dark; if the
// persisted theme is light, drop the class. Matches lib/settings.ts key.
const themeBootstrap = `try{if(localStorage.getItem("lt:theme")==="light")document.documentElement.classList.remove("dark");}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
