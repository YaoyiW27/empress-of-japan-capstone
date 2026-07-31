import type { Metadata, Viewport } from "next";
import { Playfair_Display, Libre_Franklin } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const libreFranklin = Libre_Franklin({
  variable: "--font-libre",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Echoes of the Empress of Japan",
  description: "A Web XR experience for the Vancouver Maritime Museum.",
  // Added-to-home-screen launch (see src/app/manifest.ts): standalone, with
  // the status bar drawn over the page — safe-area paddings keep content clear.
  appleWebApp: {
    capable: true,
    title: "Empress of Japan",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

// viewport-fit=cover extends the page under the iPhone notch/home indicator
// (otherwise Safari letterboxes it in landscape); env(safe-area-inset-*)
// paddings in globals.css keep controls out of those zones. A nested segment's
// viewport export *replaces* this one — /explore/layout.tsx sets it too.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${libreFranklin.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla's
          cz-shortcut-listen) inject attributes on <body> before React
          hydrates; this silences that benign one-level mismatch. */}
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
