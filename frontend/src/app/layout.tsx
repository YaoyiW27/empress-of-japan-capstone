import type { Metadata } from "next";
import { Playfair_Display, M_PLUS_1p } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["800"],
  display: "swap",
});

const mplus1p = M_PLUS_1p({
  variable: "--font-libre",
  subsets: ["latin"],
  weight: ["100", "400", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Empress of Japan",
  description: "A Web XR experience for the Vancouver Maritime Museum.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${mplus1p.variable} h-full antialiased`}
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
