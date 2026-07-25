import { Suspense } from "react";
import type { Metadata } from "next";
import VoyageExperience from "@/components/VoyageExperience";

export const metadata: Metadata = {
  title: "Voyage — Empress of Japan",
  description: "Explore the ship's scenes with the guide of your choice.",
};

/**
 * The voyage: one static shell for every narrator x scene pair. The pair comes
 * from ?scene= & ?narrator= (set by the hub), so the client component owns the
 * whole experience and both halves switch in place without a navigation.
 * Wrapped in Suspense because the client uses useSearchParams (keeps the route
 * static instead of opting into dynamic rendering). Landscape is enforced by
 * the /explore layout's OrientationGate.
 */
export default function VoyagePage() {
  return (
    <Suspense fallback={null}>
      <VoyageExperience />
    </Suspense>
  );
}
