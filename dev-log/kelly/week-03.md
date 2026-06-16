# AI-Assisted Development Log

Name: Ching-Hsin (Kelly) Hsu
Week: Week 3 (June 11 – June 17, 2026)
Date: 2026-06-15

## 1. Task / Goal
[frontend] Build the core visitor experience flow: home → 3D ship (cube
placeholder) → pick an experience scene from a side panel → enter that scene as
a **"magic window"** (look around by dragging) with a **2D narrator** overlaid
(voice comes later). Two hard requirements: the experience must run in
**landscape** (block portrait), and the scene photos are **not full 360°
panoramas** — the viewer has to handle partial/wide and near-square photos
gracefully. Seeded with two real photos (promenade deck, second-class cabin) and
one un-built placeholder scene.

## 2. AI Tools Used
Claude Code (Opus 4.8), driven through plan mode (explore → clarify → plan →
implement), on Windows / PowerShell.

## 3. Prompts / Agent Workflow
1. **Explore + capability check first** — before designing, I had Claude survey
   the existing routes and, crucially, inspect `node_modules` to confirm what the
   installed `@react-three/drei` already exposes (OrbitControls angle clamps,
   `useTexture`, `DeviceOrientationControls` with iOS permission handling). That
   told me **no new dependencies** were needed and de-risked the panorama
   approach up front.
2. **Clarify before planning** — Claude asked four targeted questions (look
   control: drag vs gyro; photo presentation: sphere-segment vs full-360;
   routing; target device) instead of guessing. I chose drag-to-look, a
   clamped sphere segment, a new `/explore` route, and phones+tablets.
3. **Plan → approve → implement** — reviewed the written plan, then let it build.
   Iterated as real photos arrived (swapped the placeholder dining room for my
   actual second-class-cabin photo).

The reusable habit again: **make the agent verify library/version capabilities
against the installed packages before designing**, not after.

## 4. Useful Output
- `src/lib/scenes.ts` — typed scene manifest (single source of truth; photos +
  angular coverage + narrator).
- `src/components/three/PanoramaScene.tsx` — the magic-window viewer (photo on
  the inside of a sphere segment, drag-to-look clamped to the photo's coverage).
- `OrientationGate.tsx` (portrait blocker), `NarratorOverlay.tsx` (2D narrator +
  voice stub), `SceneSelector.tsx` (hub side panel).
- Routes: `/explore` (ship hub) and `/explore/[sceneId]` (prerendered per scene
  via `generateStaticParams`), plus a "Step aboard" link on home.

## 5. Human Review / Changes
- **React Compiler lint was the real friction.** Next 16 + React 19 ships the
  `react-hooks/immutability` rule, which rejected two idiomatic three.js moves:
  mutating `useTexture`'s returned texture, and setting `camera.fov` on the
  `useThree()` camera. I reworked both — **clone** the texture before configuring
  it, and set FOV declaratively via drei's `<PerspectiveCamera>` instead of
  mutating. Build passed the whole time; lint was the gate that caught these.
- **Caught a real visual bug in the camera-fit math.** My first cut sized the
  camera to fill *vertically*, which is right for the wide deck pano but would
  show black wedges beside a near-square photo (the cabin) on a wide screen.
  Changed it to fit the **tighter of the two axes** so any aspect fills cleanly.
  A synthetic placeholder wouldn't have exposed this — using my actual cabin
  photo did.
- **A hydration error turned out not to be ours.** Tracked it via the dev-server
  log to a browser extension (ColorZilla's `cz-shortcut-listen` attribute on
  `<body>`), not our code. Added `suppressHydrationWarning` on `<body>` — the
  standard fix for extension/theme attribute injection.
- **Tooling gotcha**: running `next build` then `next dev` left a stale `.next`
  that 500'd the home route ("global-error not in React Client Manifest");
  clearing `.next` fixed it. Noted so I don't chase a phantom bug.
- **Honest limitation**: the per-photo coverage angles (`hFovDeg`/`vFovDeg`) are
  eyeballed — we have no capture metadata — so they're tunable knobs, verified
  on screen rather than computed.
- **UI consistency pass**: back-navigation was top-right on the hub but top-left
  in scenes; unified both to a top-left "← back" with matching styling.
- **Orientation is detect-and-block**, not forced rotation (iOS Safari can't
  force-rotate) — confirmed acceptable for the museum's phones+tablets.

## 6. Reflection
Two things paid off repeatedly. First, the explore-and-verify-capabilities step
before planning meant the panorama approach was sound on the first try and
needed zero new dependencies. Second, testing with the *real* provided photos
(not just a procedural placeholder) is what surfaced the near-square fit bug —
placeholders would have hidden it. The standout lesson this week is the React
Compiler's immutability rule in Next 16/React 19: several "normal" three.js
mutation patterns are now lint errors, and the fix is to lean on declarative
drei components / cloning instead of imperative mutation. Next up: coordinate the
glTF format with Hongyu to replace the cube ship, and start swapping placeholder
scenes for real photos as they arrive.

---

# AI-Assisted Development Log

Name: Ching-Hsin (Kelly) Hsu
Week: Week 3 (June 11 – June 17, 2026)
Date: 2026-06-16

## 1. Task / Goal
Swap the deck placeholder for a **real equirectangular 360° panorama**, add a
second 360° scene (first-class suite), and extend the magic-window viewer to
handle **full 360×180 panoramas** alongside the existing partial/flat photos —
all on the same `kelly/experience-scenes` branch (updating the open PR).

## 2. AI Tools Used
Claude Code (Opus 4.8).

## 3. Prompts / Agent Workflow
Short, direct follow-up to the experience-scenes PR: I dropped the two new images
into `public/scenes/` and asked Claude to wire them in. It first **inspected the
files** (both 1774×887, exactly 2:1) and recognized them as equirectangular 360°
panoramas before touching code — which is the distinction that drives the whole
viewer branch.

## 4. Useful Output
- Manifest: `promenade-deck` now points at `deck.png` at 360×180; added a
  `first-class-suite` scene (also 360×180). Old `deck.jpg` removed.
- `PanoramaScene.tsx` now supports **both** modes from one component: full
  panoramas (free 360° spin, near-full vertical look) and partial/flat photos
  (clamped sphere segment), keyed off whether each axis reaches full coverage.

## 5. Human Review / Changes
- **Caught a divide-by-zero-style math bug.** My partial-photo "fit" formula
  uses `tan(hFov/2)`; at 360° coverage that's `tan(180°) ≈ 0`, which collapsed
  the camera FOV to 0 (black screen). Fixed by skipping the fit on any axis that
  is already full, and only clamping look-angles for partial axes.
- **Decoupled horizontal vs. vertical fullness** (`fullH`/`fullV`) so a 360×180
  panorama spins freely *and* looks up/down, while a hypothetical 360×90
  (cylindrical) would spin freely but stay vertically clamped.
- Verified the panoramas render with free look, no mirroring, no black edges,
  and that the flat cabin photo still behaves (the partial path is unchanged).

## 6. Reflection
Designing the viewer around a single "angular coverage" abstraction
(`hFovDeg`/`vFovDeg`) paid off: supporting true 360° panoramas was a localized
change plus one math guard, not a rewrite — partial photos and full panoramas
are now the same component with two well-defined branches. The recurring theme
holds: feeding the agent the *real* assets (and having it check their actual
dimensions) is what surfaced both the format distinction and the 360° math edge
case up front.
