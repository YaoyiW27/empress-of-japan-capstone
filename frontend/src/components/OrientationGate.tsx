"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Gates the experience to landscape. iOS Safari can't force-rotate, so we detect
 * portrait and overlay a "rotate your device" blocker instead. Children stay
 * mounted underneath so state is preserved when the visitor rotates back.
 *
 * We also opportunistically call screen.orientation.lock() where supported
 * (Android/Chrome in fullscreen); it's a no-op on iOS and we never depend on it.
 */
export default function OrientationGate({ children }: { children: ReactNode }) {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const update = () => setIsPortrait(mq.matches);
    update();

    mq.addEventListener("change", update);
    window.addEventListener("resize", update);

    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    orientation?.lock?.("landscape").catch(() => {
      /* unsupported (e.g. iOS) — the overlay handles it */
    });

    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <>
      {children}
      {isPortrait && <RotateOverlay />}
    </>
  );
}

function RotateOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-ivory px-8 text-center">
      <svg
        className="h-16 w-16 animate-pulse text-brass"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M2 14a8 8 0 0 0 8 8" />
        <path d="m2 14 2.5 2.5M2 14l2.5-2.5" />
      </svg>
      <div>
        <p className="font-display text-xl font-bold text-navy">
          Please rotate your device
        </p>
        <p className="mt-2 max-w-xs text-sm text-navy-soft">
          The Empress of Japan experience is designed for landscape. Turn your
          device sideways to continue.
        </p>
      </div>
    </div>
  );
}
