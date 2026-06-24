import type { Metadata } from "next";
import ExploreHub from "@/components/ExploreHub";

export const metadata: Metadata = {
  title: "Explore the Ship — Empress of Japan",
  description: "Choose a guide aboard the Empress of Japan.",
};

export default function ExplorePage() {
  return <ExploreHub />;
}
