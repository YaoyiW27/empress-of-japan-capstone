"use client";

import { useEffect, useRef } from "react";
import { CancelButton } from "@/components/ui/NavButtons";
import type { Scene } from "@/lib/scenes";

const MAP_IMAGE = "/empress-deck-plan.png";
const INDICATOR_ICON = "/icons/Map-indicator.svg";

type MapLocation = {
  x: number;
  y: number;
};

/**
 * Coordinates measured against the complete 2622 × 1206 map asset.
 *
 * The source image includes navy margins around the blueprint, so these
 * percentages account for those margins.
 */
const mapLocations: Record<string, MapLocation> = {
  bridge: {
    x: 68.8,
    y: 40,
  },

  "crew-bedroom": {
    x: 26.1,
    y: 87.7,
  },

  "crew-mess-hall": {
    x: 25.,
    y: 83.,
  },

  "engine-room": {
    x: 41.6,
    y: 84.6,
  },

  "first-class-suite": {
    x: 65.3,
    y: 89.1,
  },

  "first-class-dining-saloon": {
    x: 63,
    y: 63.3,
  },

  "first-class-smoking-room": {
    x: 41,
    y: 37.7,
  },

  "loading-dock": {
    x: 71.2,
    y: 96,
  },

  deck: {
    x: 26.5,
    y: 41.4,
  },

  "promenade-deck": {
    x: 48,
    y: 43.3,
  },

  "swimming-pool": {
    x: 41.9,
    y: 65.8,
  },
};

type ShipMapOverlayProps = {
  scene: Scene;
  open: boolean;
  onClose: () => void;
};

export default function ShipMapOverlay({
  scene,
  open,
  onClose,
}: ShipMapOverlayProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);

  const location = mapLocations[scene.id];

  /*
   * Centre the current marker inside the scrollable viewport after the map
   * has completed layout.
   */
  useEffect(() => {
    if (!open || !location) return;

    let secondFrame = 0;

    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        const marker = markerRef.current;

        if (!viewport || !marker) return;

        viewport.scrollTo({
          left:
            marker.offsetLeft -
            viewport.clientWidth / 2,
          top:
            marker.offsetTop -
            viewport.clientHeight / 2,
          behavior: "auto",
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [open, scene.id, location]);

  // Close the map with Escape.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label={`Ship map showing the location of ${scene.title}`}
      className="ship-map-overlay"
    >
      <CancelButton
        label="Close ship map"
        onClick={onClose}
        className="ship-map-overlay__close"
        autoFocus
      />

      <div
        ref={viewportRef}
        className="ship-map-overlay__viewport"
      >
        <div className="ship-map-overlay__canvas">
          <img
            src={MAP_IMAGE}
            alt="Deck plans of the Empress of Japan"
            className="ship-map-overlay__image"
            draggable={false}
          />

          {location && (
            <div
              ref={markerRef}
              className="ship-map-overlay__marker"
              style={{
                left: `${location.x}%`,
                top: `${location.y}%`,
              }}
              aria-label={`${scene.title} location`}
            >
              <img
                src={INDICATOR_ICON}
                alt=""
                aria-hidden="true"
                className="ship-map-overlay__marker-icon"
                draggable={false}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}