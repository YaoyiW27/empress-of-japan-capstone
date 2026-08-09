"use client";

import { useEffect } from "react";
import Image from "next/image";
import { CancelButton } from "@/components/ui/NavButtons";
import type { Scene } from "@/lib/scenes";

type OriginalPhotoOverlayProps = {
  scene: Scene;
  open: boolean;
  onClose: () => void;
};

/**
 * Full-screen view of the archival black-and-white photograph a scene's
 * panorama was AI-restored from.
 *
 * Same modal contract as ShipMapOverlay: it renders outside the inert Voyage
 * content, closes on Escape, and takes focus on the close button.
 */
export default function OriginalPhotoOverlay({
  scene,
  open,
  onClose,
}: OriginalPhotoOverlayProps) {
  // Close the photograph with Escape.
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

  // A scene whose photograph has not been sourced yet has no button either,
  // so this is a guard rather than a reachable state.
  if (!open || !scene.originalPhotoSrc) return null;

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label={`The original photograph of the ${scene.title}`}
      className="original-photo-overlay"
    >
      <CancelButton
        label="Close the original photograph"
        onClick={onClose}
        className="original-photo-overlay__close"
        autoFocus
      />

      <figure className="original-photo-overlay__figure">
        {/* fill + object-contain: the archival scans have no shared aspect
            ratio, so the frame takes the space left over above the caption
            and each photograph is letterboxed inside it. */}
        <div className="original-photo-overlay__frame">
          <Image
            src={scene.originalPhotoSrc}
            alt={`Archival photograph of the ${scene.title} aboard the Empress of Japan`}
            fill
            sizes="100vw"
            className="original-photo-overlay__image"
            draggable={false}
          />
        </div>

        <figcaption className="original-photo-overlay__caption">
          <span className="original-photo-overlay__title">
            {scene.title}
          </span>

          <span className="original-photo-overlay__note">
            The archival photograph this scene&apos;s 360° panorama was
            restored from.
          </span>
        </figcaption>
      </figure>
    </section>
  );
}
