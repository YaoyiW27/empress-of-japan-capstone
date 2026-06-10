# AI-Assisted Development Log

Name: Ching-Hsin (Kelly) Hsu
Week: Week 2 (June 4 – June 10, 2026)
Date: 2026-06-10

## 1. Task / Goal
[frontend] R3F + drei placeholder 3D scene with OrbitControls. With the Next.js
scaffold merged (PR #23), render a visible "hello world" for the 3D track: a
placeholder rotating cube on a dedicated `/scene` route, lit and orbitable via
drei's `OrbitControls`. The real point is to prove the React Three Fiber render
pipeline works end-to-end under React 19 / Next 16 App Router, and to set up a
clean, reusable component structure for the real glTF model work (Hongyu
handoff) later.

## 2. AI Tools Used
Claude Code (Opus 4.8), in an explore → plan-mode → code workflow.

## 3. Prompts / Agent Workflow
Ran this one through Claude Code's **plan mode** rather than letting it code
immediately. Three phases:
1. **Explore** — a read-only agent confirmed the merged scaffold state (exact
   versions: Next 16.2.7, React 19.2.4, Tailwind v4, App Router) and verified
   there was no existing 3D code to collide with.
2. **De-risk the versions before planning** — I had Claude fetch the actual npm
   peer-dependency ranges for `@react-three/fiber`, `@react-three/drei`, and
   `three` *before* writing the plan, because the #1 failure mode here is
   pulling an R3F v8 line that only supports React 18. Confirmed fiber 9.6.1
   (peer `react >=19 <19.3`) and drei 10.7.7 (peer `react ^19`, `fiber ^9`)
   match our React 19.2.4.
3. **Plan, approve, then code** — reviewed the written plan (route placement,
   `"use client"` boundary, SSR fallback, lint risk) and only approved once the
   compatibility and SSR strategy were nailed down.

The reusable habit: *make the agent verify external version/peer constraints
against the registry before it writes any install command* — cheaper than
debugging a peer-dep blowup after the fact.

## 4. Useful Output
- Verified, React-19-compatible dependency set: `three@0.184`,
  `@react-three/fiber@^9` (9.6.1), `@react-three/drei@^10` (10.7.7),
  `@types/three` (dev).
- Three new files with a clean separation that anticipates the glTF work:
  - `src/components/three/SpinningCube.tsx` — the mesh + `useFrame` spin.
  - `src/components/three/Scene.tsx` — `"use client"` Canvas + lights +
    `OrbitControls`.
  - `src/app/scene/page.tsx` — Server Component route shell (sizes the viewport,
    renders an overlay + a back-to-home link).

## 5. Human Review / Changes
- **Decided route placement and shape myself**: a dedicated `/scene` route
  (keeps the existing landing page intact) and a rotating cube (the `useFrame`
  spin proves the render loop, `OrbitControls` proves interaction).
- **`"use client"` boundary, not `dynamic({ ssr: false })`**: agreed with the
  plan that marking the Canvas component a Client Component is sufficient under
  the App Router, and that `ssr:false` isn't even allowed from a Server
  Component in Next 16. Verified this was right — `npm run build` prerendered
  `/scene` as static with **no** browser-global SSR errors, so the documented
  dynamic-import fallback was never needed.
- **Two predicted risks didn't fire**: the plan flagged ESLint
  `react/no-unknown-property` (R3F props like `position`/`args`) and possible
  SSR global errors. `npm run lint` came back clean and `npm run build` passed
  TypeScript + prerender, so I made **no** eslint override and **no** SSR
  workaround — left the code minimal instead of adding speculative config.
- **Verified beyond "dev starts"**: ran the real `build` (the actual type/SSR
  gate) and curled both routes for `200` + expected overlay text, not just the
  dev banner. Home `/` confirmed unchanged.
- **Dev-server flakiness was environmental, not code**: the background dev
  process got killed twice mid-session (and an earlier idle instance OOM'd after
  sitting for days). Clean restarts came up fine on `localhost:3000`. Noted so I
  don't chase a phantom code bug.

## 6. Reflection
Front-loading the version/peer-range check was the whole game here — React 19
support in the R3F ecosystem is recent enough that grabbing "the tutorial
version" would have installed a React-18-only line and burned an afternoon. The
other lesson reinforced from last week: `npm run dev` succeeding proves very
little about SSR; `npm run build` is the gate that actually exercises
prerendering and types, and it's what told me the `"use client"` boundary was
sufficient. The component split (Canvas wrapper vs. mesh) is deliberately set up
so swapping the cube for a `useGLTF` model is a localized change when Hongyu's
assets land. Next: coordinate the glTF format/handoff with Hongyu and start
loading a real model into this same scene.
