/**
 * Experience-scene manifest — the single source of truth for the visitor flow.
 *
 * The ship hub (/explore), the dynamic scene route (/explore/[sceneId]), and the
 * magic-window viewer all read from here. To add a real scene: drop the photo in
 * `public/scenes/` (keep it <= 4096px wide for mobile GPUs) and add an entry
 * below with its rough angular coverage.
 */

export type SceneNarrator = {
  /** Display name shown in the overlay. */
  name: string;
  /** Placeholder dialogue until the voice/agent track wires this up. */
  greeting: string;
  /** Optional 2D avatar image (under /public). Falls back to initials. */
  avatarSrc?: string;
};

export type ExperienceScene = {
  /** URL segment, e.g. "promenade-deck". */
  id: string;
  /** Human-readable title for the hub button and scene overlay. */
  title: string;
  /** Short description for the hub button. */
  blurb?: string;
  /**
   * Photo under /public (e.g. "/scenes/deck.jpg"). Omit to render a procedural
   * placeholder texture — lets the scene exist in the UI before its photo lands.
   */
  photoSrc?: string;
  /** Horizontal angular coverage of the photo, in degrees. */
  hFovDeg: number;
  /** Vertical angular coverage of the photo, in degrees. */
  vFovDeg: number;
  narrator?: SceneNarrator;
};

export const scenes: ExperienceScene[] = [
  {
    id: "promenade-deck",
    title: "Promenade Deck",
    blurb: "Stroll the open-air promenade and look out to sea.",
    photoSrc: "/scenes/deck.jpg",
    // deck.jpg is ~4:1 (3983x1000); aspect-matched coverage keeps it undistorted
    // on the sphere segment. Tunable once we see it on screen.
    hFovDeg: 180,
    vFovDeg: 45,
    narrator: {
      name: "Storyteller",
      greeting:
        "Welcome aboard the Empress of Japan. Take a moment on the promenade — passengers walked these very boards on the crossing to Yokohama.",
    },
  },
  {
    id: "second-class-cabin",
    title: "Second-Class Cabin",
    blurb: "A second-class cabin with its bunks, washstand, and settee.",
    photoSrc: "/scenes/second-class-cabin.jpg",
    // second-class-cabin.jpg is ~1.08:1 (400x370) — a flat archival photo, so
    // coverage is modest and aspect-matched. Tunable on screen.
    hFovDeg: 60,
    vFovDeg: 56,
    narrator: {
      name: "Curator",
      greeting:
        "Second-class accommodation was compact but comfortable — fold-down bunks, a shared washstand, and a settee for the long days at sea.",
    },
  },
  {
    id: "grand-staircase",
    title: "Coming Soon",
    blurb: "Photo coming soon.",
    // No photoSrc yet → procedural placeholder. Add the photo + tune coverage later.
    hFovDeg: 120,
    vFovDeg: 70,
    narrator: {
      name: "Storyteller",
      greeting:
        "Photo coming soon — this scene isn't built out yet.",
    },
  },
];

export function getScene(id: string): ExperienceScene | undefined {
  return scenes.find((scene) => scene.id === id);
}
