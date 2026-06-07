# AI-Assisted Development Log

Name: Ching-Hsin (Kelly) Hsu
Week: Week 1 (May 26 – June 3, 2026)
Date: 2026-06-04

## 1. Task / Goal
[frontend] Scaffold the Next.js app shell under `frontend/` — my Week 1 starter
task. Goal was a standard Next.js app (TypeScript, Tailwind CSS, App Router,
ESLint, `@/*` import alias, `src/` dir) living in `frontend/` at the monorepo
root, with a minimal Tailwind-styled home page so I can confirm styling renders.
Deliberately scaffold-only: React Three Fiber, drei, and the 3D placeholder
scene are the *next* task, not this one.

## 2. AI Tools Used
Claude Code (Opus 4.8), in the VS Code extension on Windows / PowerShell.

## 3. Prompts / Agent Workflow
Single coding agent driven from a tight, numbered spec (confirm Node → run
`create-next-app` → `npm install` → replace home page → run dev + verify →
write README). I front-loaded the constraints into the prompt rather than
correcting after the fact: explicit "Tailwind is v4, there is no
`tailwind.config.js`, do not downgrade to v3," and "do NOT install R3F /
shadcn / any extras, do NOT deploy." That kept the agent from the usual
scaffold-time over-reach. I also had it track progress with a todo list and
verify each step before moving on, instead of trusting that the commands
"probably worked."

## 4. Useful Output
- A clean `create-next-app` scaffold under `frontend/` — Next.js 16.2.7,
  React 19.2.4, Tailwind v4 (no JS config, `@import "tailwindcss";` in
  `globals.css`), App Router, ESLint, `src/`, `@/*` alias.
- `src/app/page.tsx` — minimal full-screen centered "Empress of Japan" heading
  in an amber accent on a dark background; `src/app/layout.tsx` metadata updated.
- `frontend/README.md` — prerequisites (Node 20.9+), setup, scripts table,
  project structure, a Tailwind v4 note, and an explicit "not deployed yet
  (target: AWS S3 + CloudFront)".
- A `next.config.ts` `turbopack.root` fix (see below).

## 5. Human Review / Changes
- **Verified Tailwind actually compiles, not just that classes are in the
  markup.** I had it fetch the compiled stylesheet over HTTP and grep for the
  `amber` color rule + `min-h` utility, instead of accepting "the class string
  appears in the HTML" as proof. Both rules were present — real confirmation.
- **Workspace-root warning → `turbopack.root` fix.** Turbopack warned it had
  inferred the workspace root from a stray `C:\Users\kelly\package-lock.json`
  in my home dir (this is a monorepo, so it guessed wrong). I had Claude pin
  `turbopack.root` to the app dir in `next.config.ts` rather than delete a file
  outside the repo. Restarted dev — warning gone. Judged this a correctness fix,
  not an "extra," so it stayed within the no-extras constraint.
- **Port 3000 was occupied** by an unrelated `node` process on my machine, so
  dev fell back to 3001. Claude correctly *did not* kill an external process it
  didn't start — it asked first, and I chose to keep 3001. The app itself starts
  cleanly (`Ready in ~1.3s`, no errors).
- **Left the 2 moderate npm-audit warnings alone** — they're stock
  `create-next-app` transitive deps; `audit fix --force` would pull breaking
  changes for no real gain this early.
- Confirmed there is **no** `tailwind.config.js` and didn't let it create one.

## 6. Reflection
Putting the hard constraints (Tailwind v4 is expected, no extras, no deploy)
directly in the opening prompt worked better than reviewing and rolling back —
the agent never tried to "helpfully" add a v3 config or install R3F. The
verification step I'm most glad I insisted on was fetching the compiled CSS:
a class name sitting in the HTML proves nothing about whether Tailwind's
pipeline ran, and that's exactly the kind of thing that looks done but isn't.
The `turbopack.root` warning was a good reminder that scaffolding inside a
monorepo on a shared machine has environmental footguns the happy-path tutorial
never mentions. Next up: R3F + drei and a placeholder OrbitControls scene, plus
the glTF format handoff with Hongyu.
