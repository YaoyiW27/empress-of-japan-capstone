/**
 * Experience-scene manifest — the single source of truth for the visitor flow.
 *
 * The ship hub (/explore), the dynamic scene route (/explore/[sceneId]), and the
 * magic-window viewer all read from here. To add a real scene: drop the photo in
 * `public/scenes/` (keep it <= 4096px wide for mobile GPUs) and add an entry
 * below with its rough angular coverage.
 */
import type { NarratorId } from "@/components/ui/NarratorButton";

export type PersonaId =
  | "ming_chen"
  | "captain_sinclair"
  | "eleanor_whitmore";
export type SceneNarrator = {
    id: PersonaId;
    uiId: NarratorId;
    name: string;
    role: string;
    blurb: string;
    bio: string;
    portraitSrc: string;
    cutoutSrc?: string;
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
  photoSrc: string;
  /** Horizontal angular coverage of the photo, in degrees. */
  hFovDeg: number;
  /** Vertical angular coverage of the photo, in degrees. */
  vFovDeg: number;
  /** Narrators available in this scene. */
  narratorIds: PersonaId[];
};

export const narrators: SceneNarrator[] = [
  {
    id: "captain_sinclair",
    uiId: "sinclair",
    name: "Cap. Sinclair",
    role: "Captain",
    blurb: "Command the ship from the bridge and the working decks.",
    bio: "A veteran mariner with more than thirty years at sea, Captain James Sinclair commands the Empress of Japan with discipline and quiet confidence. Responsible for the safety of hundreds of passengers and crew, he oversees every aspect of the voyage.",
    portraitSrc: "/narrator/captain.png",
    cutoutSrc: "/narrator/captain-cutout.png",
  },
  {
    id: "eleanor_whitmore",
    uiId: "whitmore",
    name: "Ms. Whitmore",
    role: "First-Class Passenger",
    blurb: "Promenade the decks and the grand rooms of first class.",
    bio: "Eleanor Whitmore is the daughter of a prominent railway executive and a familiar face in Vancouver's upper social circles. Traveling to Yokohama to visit relatives and pursue charitable work abroad, she spends her days attending dinners, writing letters, and mingling with fellow first-class passengers.",
    portraitSrc: "/narrator/first-class.png",
    cutoutSrc: "/narrator/first-class-cutout.png",
  },
  {
    id: "ming_chen",
    uiId: "ming",
    name: "Ming Chen",
    role: "Hong Kong Crew",
    blurb: "See the ship from below, where the crew worked and slept.",
    bio: "Ming left Hong Kong several years ago in search of opportunity and now works deep within the ship's engine spaces. Most passengers never see him, yet he knows the vessel better than almost anyone. Long hours among the boilers have taught him to notice every unusual vibration.",
    portraitSrc: "/narrator/crew.png",
    cutoutSrc: "/narrator/crew-cutout.png",
  },
];
export function getNarrator(
  id: PersonaId,
): SceneNarrator | undefined {
  return narrators.find(
    (narrator) => narrator.id === id,
  );
}

export function getNarratorByUiId(
  uiId: NarratorId,
): SceneNarrator | undefined {
  return narrators.find(
    (narrator) => narrator.uiId === uiId,
  );
}
export const scenes: ExperienceScene[] = [
  {
    id: "bridge",
    backendSceneId: "bridge",
    title: "Bridge",
    photoSrc: "/scenes/Bridge.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narratorIds: [
      "captain_sinclair",
      "eleanor_whitmore",
      "ming_chen",
    ],
  },
  {
    id: "engine-room",
    backendSceneId: "engine_room",
    title: "Engine Room",
    photoSrc: "/scenes/Engine-Room.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narratorIds: [
      "captain_sinclair",
      "eleanor_whitmore",
      "ming_chen",
    ],
  },
  {
    id: "first-class-dining-saloon",
    backendSceneId: "first_class_dining_saloon",
    title: "First-Class Dining Saloon",
    photoSrc: "/scenes/FirstClass-Dining-Saloon.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narratorIds: [
      "captain_sinclair",
      "eleanor_whitmore",
      "ming_chen",
    ],
  },
  {
    id: "first-class-smoking-room",
    backendSceneId: "first_class_smoking_room",
    title: "First-Class Smoking Room",
    photoSrc: "/scenes/FirstClass-Smoking-Room.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narratorIds: [
      "captain_sinclair",
      "eleanor_whitmore",
      "ming_chen",
    ],
  },
  {
    id: "first-class-suite",
    backendSceneId: "first_class_suite",
    title: "First-Class Suite",
    photoSrc: "/scenes/FirstClass-suite.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narratorIds: [
      "captain_sinclair",
      "eleanor_whitmore",
      "ming_chen",
    ],
  },
  {
    id: "loading-dock",
    backendSceneId: "loading_dock",
    title: "Loading Dock",
    photoSrc: "/scenes/Loading-Dock.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narratorIds: [
      "captain_sinclair",
      "eleanor_whitmore",
      "ming_chen",
    ],
  },
  {
    id: "promenade-deck",
    backendSceneId: "promenade_deck",
    title: "Promenade Deck",
    photoSrc: "/scenes/Promenade-Deck.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narratorIds: [
      "captain_sinclair",
      "eleanor_whitmore",
      "ming_chen",
    ],
  },
  {
    id: "sport-deck",
    backendSceneId: "sport_deck",
    title: "Sport Deck",
    photoSrc: "/scenes/Sport-deck.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narratorIds: [
      "captain_sinclair",
      "eleanor_whitmore",
      "ming_chen",
    ],
  },
  {
    id: "steerage-bedroom",
    backendSceneId: "steerage_bedroom",
    title: "Steerage Bedroom",
    photoSrc: "/scenes/SteerageClass-Bedroom.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narratorIds: [
      "captain_sinclair",
      "eleanor_whitmore",
      "ming_chen",
    ],
  },
  {
    id: "steerage-dining-hall",
    backendSceneId: "steerage_dining_hall",
    title: "Steerage Dining Hall",
    photoSrc: "/scenes/SteerageClass-Dining-Hall.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narratorIds: [
      "captain_sinclair",
      "eleanor_whitmore",
      "ming_chen",
    ],
  },
  {
    id: "swimming-pool",
    backendSceneId: "swimming_pool",
    title: "Swimming Pool",
    photoSrc: "/scenes/Swimming-Pool.png",
    hFovDeg: 360,
    vFovDeg: 180,
    narratorIds: [
      "captain_sinclair",
      "eleanor_whitmore",
      "ming_chen",
    ],
  },
];

export function getScene(id: string): ExperienceScene | undefined {
  return scenes.find((scene) => scene.id === id);
}