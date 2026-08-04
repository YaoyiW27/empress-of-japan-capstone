import type { MetadataRoute } from "next";

/**
 * Web app manifest — lets visitors (and the museum's kiosk devices) "Add to
 * Home Screen"; launched that way the app runs standalone, i.e. truly
 * full-screen with no browser chrome. iPhone Safari has no Fullscreen API for
 * regular pages, so this is the only real full-screen path on iOS.
 *
 * Colors mirror the @theme tokens in globals.css (--color-ivory, --color-navy).
 * With `output: "export"` this is prerendered to out/manifest.webmanifest.
 */
// Required with `output: "export"` — metadata routes must opt in to static.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Echoes of the Empress of Japan",
    short_name: "Empress of Japan",
    description: "A Web XR experience for the Vancouver Maritime Museum.",
    start_url: "/",
    display: "standalone",
    // iOS ignores this (the OrientationGate covers it); Android honors it.
    orientation: "landscape",
    background_color: "#f2efe8",
    theme_color: "#101c3c",
    icons: [
      { src: "/icons/pwa-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
