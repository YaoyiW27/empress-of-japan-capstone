/**
 * Narrator manifest — the single source of truth for the visitor flow.
 *
 * Three narrators ("storylines"), each with their own set of 360x180 panorama
 * scenes. The ship hub (/explore) lists the narrators; /explore/[narratorId]
 * drops you into that narrator's scenes, switchable in place.
 *
 * Dialogue is intentionally not scripted here — the voice/agent track wires up
 * AI conversation later. `bio` is the narrator's introduction copy.
 */

export type Scene = {
  /** URL-ish id, unique within the narrator. */
  id: string;
  /** Canonical scene id sent to POST /chat. */
  backendSceneId: string;
  title: string;
  /** Full equirectangular 360x180 panorama under /public. */
  photoSrc: string;
};

export type Narrator = {
  id: string;
  /** Display name. */
  name: string;
  /** Short role label, e.g. "Captain". */
  role: string;
  /** One-line teaser for the selection card. */
  blurb: string;
  /** Introduction paragraph (shown in the in-scene narrator panel). */
  bio: string;
  /** Framed portrait (has a background) — used on the selection card. */
  portraitSrc: string;
  /** Transparent cut-out for standing in the scene. */
  cutoutSrc?: string;
  scenes: Scene[];
};

export const narrators: Narrator[] = [
  {
    id: "captain_sinclair",
    name: "Cap. Sinclair",
    role: "Captain",
    blurb: "Command the ship from the bridge and the working decks.",
    bio: "A veteran mariner with more than thirty years at sea, Captain James Sinclair commands the Empress of Japan with discipline and quiet confidence. Responsible for the safety of hundreds of passengers and crew, he oversees every aspect of the voyage.",
    portraitSrc: "/narrator/captain.png",
    cutoutSrc: "/narrator/captain-cutout.png",
    scenes: [
      {
        id: "bridge",
        backendSceneId: "bridge",
        title: "Bridge",
        photoSrc: "/scenes/captain/bridge.png",
      },
      {
        id: "loading-dock",
        backendSceneId: "loading_dock",
        title: "Loading Dock",
        photoSrc: "/scenes/captain/loading-dock.png",
      },
    ],
  },
  {
    id: "eleanor_whitmore",
    name: "Ms. Whitmore",
    role: "First-Class Passenger",
    blurb: "Promenade the decks and the grand rooms of first class.",
    bio: "Eleanor Whitmore is the daughter of a prominent railway executive and a familiar face in Vancouver's upper social circles. Traveling to Yokohama to visit relatives and pursue charitable work abroad, she spends her days attending dinners, writing letters, and mingling with fellow first-class passengers.",
    portraitSrc: "/narrator/first-class.png",
    cutoutSrc: "/narrator/first-class-cutout.png",
    scenes: [
      {
        id: "promenade-deck",
        backendSceneId: "promenade_deck",
        title: "Promenade Deck",
        photoSrc: "/scenes/first-class/promenade-deck.png",
      },
      {
        id: "deck",
        backendSceneId: "open_deck",
        title: "Boat Deck",
        photoSrc: "/scenes/first-class/deck.png",
      },
      {
        id: "first-class-dining-saloon",
        backendSceneId: "dining_saloon",
        title: "Dining Saloon",
        photoSrc: "/scenes/first-class/first-class-dining-saloon.png",
      },
      {
        id: "first-class-suite",
        backendSceneId: "first_class_suite",
        title: "First-Class Suite",
        photoSrc: "/scenes/first-class/first-class-suite.png",
      },
      {
        id: "swimming-pool",
        backendSceneId: "swimming_pool",
        title: "Swimming Pool",
        photoSrc: "/scenes/first-class/swimming-pool.png",
      },
    ],
  },
  {
    id: "ming_chen",
    name: "Ming Chen",
    role: "Hong Kong Crew",
    blurb: "See the ship from below, where the crew worked and slept.",
    bio: "Ming left Hong Kong several years ago in search of opportunity and now works deep within the ship's engine spaces. Most passengers never see him, yet he knows the vessel better than almost anyone. Long hours among the boilers have taught him to notice every unusual vibration.",
    portraitSrc: "/narrator/crew.png",
    cutoutSrc: "/narrator/crew-cutout.png",
    scenes: [
      {
        id: "engine-room",
        backendSceneId: "engine_room",
        title: "Engine Room",
        photoSrc: "/scenes/crew/engine-room.png",
      },
      {
        id: "crew-bedroom",
        backendSceneId: "crew_bedroom",
        title: "Crew Quarters",
        photoSrc: "/scenes/crew/crew-bedroom.png",
      },
    ],
  },
];

export function getNarrator(id: string): Narrator | undefined {
  return narrators.find((narrator) => narrator.id === id);
}
