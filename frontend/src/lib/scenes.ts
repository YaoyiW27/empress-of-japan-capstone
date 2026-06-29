/**
 * Experience-scene manifest — the single source of truth for the visitor flow.
 *
 * The ship hub (/explore), the dynamic scene route (/explore/[sceneId]), and the
 * magic-window viewer all read from here. To add a real scene: drop the photo in
 * `public/scenes/` (keep it <= 4096px wide for mobile GPUs) and add an entry
 * below with its rough angular coverage.
 */

export type SceneNarrator = {
  /** Backend persona_id sent to POST /chat. */
  id: "ming_chen" | "captain_sinclair" | "eleanor_whitmore";
  /** Display name shown in the overlay. */
  name: string;
  /** Placeholder dialogue until the voice/agent track wires this up. */
  greeting: string;
  /** Optional 2D avatar image under /public. Falls back to initials. */
  avatarSrc?: string;
};

export type ExperienceScene = {
  /** URL segment, e.g. "promenade-deck". */
  id: string;
  /** Backend scene id sent to POST /chat. */
  backendSceneId: string;
  /** Human-readable title for the hub button and scene overlay. */
  title: string;
  /** Short description for the hub button. */
  blurb?: string;
  /**
   * Photo under /public, e.g. "/scenes/deck.png".
   * Omit to render a procedural placeholder texture.
   */
  photoSrc?: string;
  /** Horizontal angular coverage of the photo, in degrees. */
  hFovDeg: number;
  /** Vertical angular coverage of the photo, in degrees. */
  vFovDeg: number;
  /** Narrators available in this scene. */
  narrators: SceneNarrator[];
};

export const narrators: SceneNarrator[] = [
  {
    id: "ming_chen",
    name: "Ming Chen",
    greeting:
      "I'm Ming Chen. Most of my work happens below deck, where the ship feels less like a grand liner and more like a place of heat, noise, and long shifts.",
    avatarSrc: "/narrators/ming-chen.png",
  },
  {
    id: "captain_sinclair",
    name: "Captain Sinclair",
    greeting:
      "Captain Sinclair. A vessel like the Empress of Japan requires discipline, judgment, and steady hands from everyone aboard.",
    avatarSrc: "/narrators/captain-sinclair.png",
  },
  {
    id: "eleanor_whitmore",
    name: "Ms. Whitmore",
    greeting:
      "I'm Eleanor Whitmore. To me, the voyage is not merely a crossing, but an experience of comfort, conversation, and discovery.",
    avatarSrc: "/narrators/eleanor-whitmore.png",
  },
];

export const scenes: ExperienceScene[] = [
  {
    id: "promenade-deck",
    backendSceneId: "promenade_deck",
    title: "Promenade Deck",
    blurb: "Stroll the open-air promenade and look out to sea.",
    photoSrc: "/scenes/deck.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narrators,
  },
  {
    id: "first-class-suite",
    backendSceneId: "first_class_suite",
    title: "First-Class Suite",
    blurb: "Look around a first-class suite, paneled in polished wood.",
    photoSrc: "/scenes/first-class-suite.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narrators,
  },
  {
    id: "dining-saloon",
    backendSceneId: "dining_saloon",
    title: "Dining Saloon",
    blurb: "Step into the first-class dining saloon.",
    photoSrc: "/scenes/dining-saloon.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narrators,
  },
  {
    id: "engine-room",
    backendSceneId: "engine_room",
    title: "Engine Room",
    blurb: "Explore the machinery and labor below deck.",
    photoSrc: "/scenes/engine-room.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narrators,
  },
  {
    id: "loading-dock",
    backendSceneId: "loading_dock",
    title: "Loading Dock",
    blurb: "Begin at the busy dock where passengers and cargo board the ship.",
    photoSrc: "/scenes/loading-dock.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narrators,
  },
  {
    id: "second-class-cabin",
    backendSceneId: "second_class_cabin",
    title: "Second-Class Cabin",
    blurb: "A second-class cabin with its bunks, washstand, and settee.",
    photoSrc: "/scenes/second-class-cabin.jpg",
    hFovDeg: 60,
    vFovDeg: 56,
    narrators,
  },
];

export function getScene(id: string): ExperienceScene | undefined {
  return scenes.find((scene) => scene.id === id);
}