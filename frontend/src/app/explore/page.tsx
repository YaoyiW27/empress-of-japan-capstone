import { Suspense } from "react";
import type { Metadata } from "next";
import ExploreHub from "@/components/ExploreHub";

export const metadata: Metadata = {
  title: "Explore the Ship — Empress of Japan",
  description: "Choose a guide aboard the Empress of Japan.",
};

/**
 * Suspense because the hub reads ?narrator= & ?scene= (bio-page preselection)
 * via useSearchParams — the boundary keeps this route static in the export.
 */
export default function ExplorePage() {
  return (
    <Suspense fallback={null}>
      <ExploreHub />
    </Suspense>
  );
}
