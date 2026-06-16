import type { Viewport } from "next";
import type { ReactNode } from "react";
import OrientationGate from "@/components/OrientationGate";

/**
 * Lock pinch-zoom so it doesn't fight drag-to-look inside the scenes, and apply
 * the landscape OrientationGate to the whole /explore subtree (the ship hub and
 * every experience scene).
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function ExploreLayout({ children }: { children: ReactNode }) {
  return <OrientationGate>{children}</OrientationGate>;
}
