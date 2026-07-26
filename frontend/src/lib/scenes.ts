/**
 * Experience manifest — the single source of truth for the visitor flow.
 *
 * Narrators and scenes are independent (scene-first): any narrator can guide
 * any scene. The ship hub (/explore) offers both pickers; /explore/voyage
 * renders the chosen pair and lets either half switch in place.
 *
 * Dialogue is intentionally not scripted here — the voice/agent track wires up
 * AI conversation. `bio` is the narrator's introduction copy. To add a scene:
 * drop the photo under `public/scenes/` (keep it <= 4096px wide for mobile
 * GPUs) and add an entry below.
 */

export type Narrator = {
  id: string;
  /** Display name. */
  name: string;
  /** Short role label, e.g. "Captain". */
  role: string;
  /** One-line teaser for the selection card. */
  blurb: string;
  /** Introduction paragraph (hover / long-press on the hub portrait). */
  bio: string;
  /** Framed portrait (has a background) — used on the selection card. */
  portraitSrc: string;
  /** Transparent cut-out for standing in the scene. */
  cutoutSrc?: string;
};

/**
 * Where a scene sits on the hub's 3D ship, as fractions of the hull's
 * bounding box — robust to model swaps and unknown glTF scale:
 * - `length`: 0 → 1 along the ship's long axis
 * - `height`: 0 (keel) → 1 (highest point)
 * - `beam`: -1 → 1 across the hull; 0 (default) = centerline
 * Tuned by eye against the current model; adjust freely.
 */
export type ShipSpot = {
  length: number;
  height: number;
  beam?: number;
};

export type Scene = {
  /** URL-ish id, unique across the app. */
  id: string;
  /** Canonical scene id sent to POST /chat (must match data/ai/scenes/*.md). */
  backendSceneId: string;
  title: string;
  /** Full equirectangular 360x180 panorama under /public. */
  photoSrc: string;
  /** Narrators available in this scene (currently: everyone, everywhere). */
  narratorIds: string[];
  /** Marker position on the hub's 3D ship. */
  shipSpot: ShipSpot;
};

export const narrators: Narrator[] = [
  {
    id: "captain_sinclair",
    name: "Cap. Sinclair",
    role: "Captain",
    blurb: "Command the ship from the bridge and the working decks.",
    bio: "A veteran mariner with more than thirty years at sea, Captain James Sinclair commands the Empress of Japan with discipline and quiet confidence. Responsible for the safety of hundreds of passengers and crew, he oversees every aspect of the voyage.",
    portraitSrc: "/narrator/captain.png",
    cutoutSrc: "/narrators/sinclair/Sinclair-profile.png",
  },
  {
    id: "eleanor_whitmore",
    name: "Ms. Whitmore",
    role: "First-Class Passenger",
    blurb: "Promenade the decks and the grand rooms of first class.",
    bio: "Eleanor Whitmore is the daughter of a prominent railway executive and a familiar face in Vancouver's upper social circles. Traveling to Yokohama to visit relatives and pursue charitable work abroad, she spends her days attending dinners, writing letters, and mingling with fellow first-class passengers.",
    portraitSrc: "/narrator/first-class.png",
    cutoutSrc: "/narrators/whitmore/Whitmore-profile.png",
  },
  {
    id: "ming_chen",
    name: "Ming Chen",
    role: "Hong Kong Crew",
    blurb: "See the ship from below, where the crew worked and slept.",
    bio: "Ming left Hong Kong several years ago in search of opportunity and now works deep within the ship's engine spaces. Most passengers never see him, yet he knows the vessel better than almost anyone. Long hours among the boilers have taught him to notice every unusual vibration.",
    portraitSrc: "/narrator/crew.png",
    cutoutSrc: "/narrators/ming/Ming-profile.png",
  },
];

const allNarratorIds = narrators.map((narrator) => narrator.id);

export const scenes: Scene[] = [
  {
    id: "bridge",
    backendSceneId: "bridge",
    title: "Bridge",
    photoSrc: "/scenes/captain/bridge.png",
    narratorIds: allNarratorIds,
    shipSpot: { length: 0.7, height: 0.35 },
  },
  {
    id: "loading-dock",
    backendSceneId: "loading_dock",
    title: "Loading Dock",
    photoSrc: "/scenes/captain/loading-dock.png",
    narratorIds: allNarratorIds,
    shipSpot: { length: 0.5, height: 0.1, beam: 2.4 },
  },
  {
    id: "promenade-deck",
    backendSceneId: "promenade_deck",
    title: "Promenade Deck",
    photoSrc: "/scenes/first-class/promenade-deck.png",
    narratorIds: allNarratorIds,
    shipSpot: { length: 0.5, height: 0.35, beam: 0.7 },
  },
  {
    // Title follows the historical name; the ids stay stable backend keys.
    id: "deck",
    backendSceneId: "open_deck",
    title: "Sport Deck",
    photoSrc: "/scenes/first-class/deck.png",
    narratorIds: allNarratorIds,
    shipSpot: { length: 0.78, height: 0.35 },
  },
  {
    id: "first-class-dining-saloon",
    backendSceneId: "dining_saloon",
    title: "Dining Saloon",
    photoSrc: "/scenes/first-class/first-class-dining-saloon.png",
    narratorIds: allNarratorIds,
    shipSpot: { length: 0.6, height: 0.5 },
  },
  {
    id: "first-class-suite",
    backendSceneId: "first_class_suite",
    title: "First-Class Suite",
    photoSrc: "/scenes/first-class/first-class-suite.png",
    narratorIds: allNarratorIds,
    shipSpot: { length: 0.6, height: 0.35 },
  },
  {
    id: "swimming-pool",
    backendSceneId: "swimming_pool",
    title: "Swimming Pool",
    photoSrc: "/scenes/first-class/swimming-pool.png",
    narratorIds: allNarratorIds,
    shipSpot: { length: 0.35, height: 0.32 },
  },
  {
    id: "engine-room",
    backendSceneId: "engine_room",
    title: "Engine Room",
    photoSrc: "/scenes/crew/engine-room.png",
    narratorIds: allNarratorIds,
    shipSpot: { length: 0.45, height: 0.16 },
  },
  {
    // Historically a steerage passenger space (see data/ai persona notes);
    // the ids stay stable backend keys.
    id: "crew-bedroom",
    backendSceneId: "crew_bedroom",
    title: "Steerage Bedroom",
    photoSrc: "/scenes/crew/crew-bedroom.png",
    narratorIds: allNarratorIds,
    shipSpot: { length: 0.12, height: 0.35 },
  },
];

export function getNarrator(id: string): Narrator | undefined {
  return narrators.find((narrator) => narrator.id === id);
}

export function getScene(id: string): Scene | undefined {
  return scenes.find((scene) => scene.id === id);
}
