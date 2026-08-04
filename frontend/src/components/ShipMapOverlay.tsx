"use client";

import { useEffect, useRef } from "react";
import { IconButton } from "@/components/ui/NavButtons";
import type { Scene } from "@/lib/scenes";

const MAP_IMAGE = "/empress-deck-plan.png";
const INDICATOR_ICON = "/icons/map-indicator.svg";

type MapLocation = {
  x: number;
  y: number;
  deck: string;
  displayName?: string;
};

/**
 * Percentage coordinates measured against the clean blueprint image.
 *
 * These keys must match Scene.id in src/lib/scenes.ts.
 * The values can be adjusted later without changing the component.
 */
const mapLocations: Record<string, MapLocation> = {
  bridge: {
    x: 84.4,
    y: 40,
    deck: "Promenade Deck",
  },

  "crew-bedroom": {
    x: 12.4,
    y: 79.7,
    deck: "Main Deck",
    displayName: "Steerage Bedroom",
  },

  "crew-mess-hall": {
    x: 14.1,
    y: 87.4,
    deck: "Main Deck",
    displayName: "Steerage Mess Hall",
  },

  "engine-room": {
    x: 33.8,
    y: 84.6,
    deck: "Main Deck",
  },

  "first-class-suite": {
    x: 66.5,
    y: 91.1,
    deck: "Main Deck",
  },

  "first-class-dining-saloon": {
    x: 68.8,
    y: 63.3,
    deck: "Upper Deck",
    displayName: "First-Class Dining Saloon",
  },

  "first-class-smoking-room": {
    x: 37.3,
    y: 39.7,
    deck: "Promenade Deck",
    displayName: "First-Class Smoking Room",
  },

  "loading-dock": {
    x: 74.6,
    y: 97.4,
    deck: "Main Deck",
  },

  deck: {
    x: 13,
    y: 41.4,
    deck: "Promenade Deck",
    displayName: "Sport Deck",
  },

  "promenade-deck": {
    x: 68.8,
    y: 46.3,
    deck: "Promenade Deck",
  },

  "swimming-pool": {
    x: 38.4,
    y: 65.8,
    deck: "Upper Deck",
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
   * Centre the current scene without scrolling the webpage itself.
   * The second animation frame waits until the map has completed layout.
   */
  useEffect(() => {
    if (!open || !location) return;

    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        const marker = markerRef.current;

        if (!viewport || !marker) return;

        const markerCenterX = marker.offsetLeft + marker.offsetWidth / 2;
        const markerCenterY = marker.offsetTop + marker.offsetHeight / 2;

        viewport.scrollTo({
          left: markerCenterX - viewport.clientWidth / 2,
          top: markerCenterY - viewport.clientHeight / 2,
          behavior: "smooth",
        });
      });

      return () => window.cancelAnimationFrame(secondFrame);
    });

    return () => window.cancelAnimationFrame(firstFrame);
  }, [open, scene.id, location]);

  /*
   * Close with Escape and prevent the background interface from receiving
   * keyboard interaction while the map is open.
   */
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

  const locationName = location?.displayName ?? scene.title;

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="ship-map-title"
      className="ship-map-overlay"
    >
      <header className="ship-map-overlay__header">
        <div className="ship-map-overlay__title">
          <p className="ship-map-overlay__eyebrow">Current location</p>

          <h2 id="ship-map-title">{locationName}</h2>

          {location && (
            <p className="ship-map-overlay__deck">{location.deck}</p>
          )}
        </div>

        <IconButton
          icon="cancel"
          label="Close ship map"
          onClick={onClose}
          className="ship-map-overlay__close"
          autoFocus
        />
      </header>

      <div
        ref={viewportRef}
        className="ship-map-overlay__viewport"
        aria-label={`Ship map showing ${locationName}`}
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
            >
              <img
                src={INDICATOR_ICON}
                alt=""
                aria-hidden="true"
                className="ship-map-overlay__marker-icon"
                draggable={false}
              />

              <span className="ship-map-overlay__marker-label">
                {locationName}
              </span>
            </div>
          )}
        </div>
      </div>

      {!location && (
        <p className="ship-map-overlay__unavailable">
          This scene has not been positioned on the ship map yet.
        </p>
      )}

      <p className="ship-map-overlay__hint">
        Drag or scroll to explore the deck plan
      </p>
    </section>
  );
}