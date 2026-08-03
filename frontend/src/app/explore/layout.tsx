import type { Viewport } from "next";
import type { ReactNode } from "react";
import OrientationGate from "@/components/OrientationGate";

/**
 * Lock pinch-zoom so it doesn't fight drag-to-look inside the scenes, and apply
 * the landscape OrientationGate to the whole /explore subtree (the ship hub and
 * every experience scene). viewportFit "cover" must be repeated here: this
 * export replaces the root layout's, and without it a notched iPhone
 * letterboxes the experience in landscape.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function ExploreLayout({ children }: { children: ReactNode }) {
  return <OrientationGate>{children}</OrientationGate>;
}
