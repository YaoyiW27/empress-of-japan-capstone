# AI-Assisted Development Log

Name: Ching-Hsin (Kelly) Hsu
Week: Week 4 (June 18 – June 24, 2026)
Date: 2026-06-23

## 1. Task / Goal
Turn the bare R3F scaffold into the real visitor experience on the
`kelly/visitor-flow` branch: a themed UI plus the narrator-guided flow —
home → "Step aboard" → a 3-pane hub (pick one of three narrators) → that
narrator's 360° panorama scenes, switchable in place, with the narrator present
— and swap the placeholder cube for an actual glTF ship model.

## 2. AI Tools Used
Claude Code (Opus 4.8): plan mode for the big restructures, then a tight
iterate-on-feedback loop for the visual/UX polish.

## 3. Prompts / Agent Workflow
Two modes, deliberately:
1. **Plan mode for the structural changes** — the Art Deco theme direction, the
   narrator-storyline restructure, and the 3-pane hub each went through
   explore → AskUserQuestion → written plan → approval before any code. For the
   theme I had Claude present **light-theme options with palette/typography
   previews** and picked "Art Deco luxury (ivory)"; for the flow I confirmed
   in-place scene switching + free navigation up front.
2. **Fast iteration for polish** — once the structure was in, I drove a rapid
   loop on look-and-feel (poster sizing, circular narrator avatars, right-panel
   layout, vertical text scene buttons, model lighting). Each turn Claude made
   the change and re-ran `npm run lint` + `npm run build` + a dev check before
   handing back.

## 4. Useful Output
- **Design system**: Tailwind v4 `@theme` tokens (ivory/brass/navy/vermilion) +
  Playfair Display / Libre Franklin; reusable `ui/Button` + `ui/Divider`.
- **Narrator model + flow**: `lib/narrators.ts` manifest (3 narrators, bios,
  their 360 panoramas); `ExploreHub` (3-pane selector), `NarratorExperience`
  (one persistent panorama whose scene swaps in place, textures preloaded),
  `SceneRail`, cut-out `NarratorOverlay`.
- **3D ship**: `ShipModel` (`useGLTF`) + `Scene` auto-framing the model with
  drei `Bounds`/`Center` and IBL via `Environment`.

## 5. Human Review / Changes
- **React Compiler (Next 16 / React 19) immutability rule** kept catching
  idiomatic three.js mutation — fixed by cloning textures and going declarative
  (drei `<PerspectiveCamera>` instead of mutating `camera.fov`).
- **Mobile fit**: pages overflowed because `h-screen` = `100vh` includes mobile
  browser chrome; switched to `h-dvh` so each screen actually fits the visible
  viewport.
- **Dark model**: the glTF ship rendered very dark — root cause was PBR
  materials with no environment; added drei `<Environment>` (IBL) + brighter
  lights. Also learned the cube needed retinting once its dark stage was removed.
- **Static-export hygiene**: opening a scene at `?scene=` first made the route
  dynamic (bad for the S3/CloudFront target); moved the query read to a client
  `useSearchParams` inside a `<Suspense>` so the route stays prerendered.
- **Lots of UX calls of mine**: light (not dark) theme; poster between text and
  CTA, sized to one screen; circular narrator portraits with the left rail as
  image-only; right panel contained in a padded card with bigger type; scene
  switcher moved from a cramped top-right thumbnail strip to a right-edge column
  of uniform, centered, rounded text buttons (better on mobile).
- Narrator **dialogue intentionally left unscripted** (a disabled "Talk" stub) —
  the voice/agent track wires up AI conversation later; `bio` is just the intro.

## 6. Reflection
The split worked well: plan mode kept the three big restructures from going
sideways (especially getting the theme direction and the in-place-switch
decision agreed *before* coding), while the fast loop was right for the long
tail of visual tweaks where seeing it on screen is the only real spec. The two
most valuable non-obvious fixes were environmental, not feature work — `h-dvh`
for the mobile viewport and `<Environment>` for the dark PBR model — both things
that "looked broken" but weren't code bugs. Next: pick the final ship model
(currently trying `empress_hunyuan3d`; `*_web` variants are lighter), get the
glTF lighting dialed in, and coordinate with the backend/voice track to replace
the Talk stub with real AI conversation.
