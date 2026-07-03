# AI-Assisted Development Log

Name: Ching-Hsin (Kelly) Hsu
Week: Week 5 (June 25 - July 1, 2026)
Date: 2026-07-01

## 1. Task / Goal
Make the panorama experience work as a real mobile "magic window": tilt the
phone (gyroscope) to look around, and fix the layout so the whole UI actually
fits a phone in landscape. Branch: `kelly/gyro-magic-window`.

## 2. AI Tools Used
Claude Code (Opus 4.8): plan mode for the gyro design, then a tight
iterate-on-device-feedback loop for the mobile layout.

## 3. Prompts / Agent Workflow
Plan-first for the gyro feature: an Explore agent confirmed the installed drei
already ships `DeviceOrientationControls` (with iOS permission handling) and that
we had no gyro code yet, then I clarified the two constraints that actually
shape it — gyro-default on mobile, and I have an iPhone but also want a desktop
sim loop. After approving the plan I implemented, then drove the layout fixes
from real screenshots off the phone.

The reusable habit this week: **before branching, sync main.** Pulling first
surfaced that the voice track had merged (narrator IDs changed to
`captain_sinclair` etc., NarratorOverlay became the AI-chat component) — so I
built the gyro changes against the *current* code and stayed compatible with
Steven's voice work instead of clobbering it.

## 4. Useful Output
- `PanoramaScene`: a `mode: "drag" | "gyro"` prop — gyro mounts drei
  `DeviceOrientationControls`, drag keeps `OrbitControls` (only one at a time).
- `NarratorExperience`: device-orientation detection (gyro-default on Android
  touch; iOS/desktop start in drag), a "🧭 Phone view / 🖐 Drag view" toggle
  whose tap also runs the iOS `requestPermission()`.
- `dev:https` script for local device testing.
- A mobile-responsive pass on the hub + scene overlays.

## 5. Human Review / Changes
- **React Compiler** flagged `setState` inside my detection `useEffect`
  (`react-hooks/set-state-in-effect`); moved the detection into `useState`
  initializers instead — cleaner and no cascading render.
- **iOS permission must be in the gesture**: `requestPermission()` is called
  synchronously in the toggle's onClick, or Safari silently denies.
- **Real-iPhone testing was the hard part.** `next dev --experimental-https`
  gave a blank page on the phone — the self-signed cert isn't trusted for the
  LAN IP, so Safari blocked the JS/HMR after "visit anyway". Pivoted to deploying
  the branch with the **Vercel CLI** (`vercel --prod`, real HTTPS) — gyro then
  worked end to end. (Also hit a Vercel monorepo gotcha: the team project's Root
  Directory is `frontend`, so a personal CLI project from `frontend/` avoided a
  doubled `frontend/frontend` path.)
- **Mobile layout didn't fit** (from phone screenshots): the design used `sm:`
  (>=640px) as "desktop", but a landscape phone is >=640px yet only ~390px tall,
  so everything was oversized and the right panel overflowed off-screen. Fixes:
  moved the roomy sizing to **`lg:`** (>=1024 = real desktop/tablet), gave the
  center column **`min-w-0`** so it shrinks instead of pushing the panel off,
  **stacked the gyro toggle above the scene rail** (a long scene list no longer
  covers the toggle), and padded the scrollable scene list so the top card's
  hover-lift isn't clipped.
- **`.gitignore`**: kept the Vercel-added `.vercel` / `.env*` ignores — important
  so the pulled `.env.local` (Vercel env vars) never gets committed.
- Also shortened a few scene titles ("The Bridge" → "Bridge").

## 6. Reflection
Device sensors are the classic "works in theory" feature: the logic was quick,
but *testing* it needed a secure context + a real device, and the self-signed
cert dead-end cost the most time — the Vercel CLI deploy turned out to be the
reliable path and doubles as the demo URL. The other keeper is the breakpoint
lesson: "landscape phone" is wide but short, so width-only `sm:` breakpoints
quietly treat it as desktop; designing compact-by-default and only enlarging at
`lg:` fixed it. Next: confirm gyro axis feel across a couple of phones, and once
the backend voice endpoint is reachable from a deploy, test the narrator chat +
gyro together.
