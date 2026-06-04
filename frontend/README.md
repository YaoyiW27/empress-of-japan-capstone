# Empress of Japan — Frontend

The web app shell for the **Empress of Japan** Web XR museum experience, built
for the Vancouver Maritime Museum. This is the Next.js frontend that lives in
the `frontend/` directory of the monorepo.

> **Note:** This is currently just the app scaffold. React Three Fiber and the
> 3D scenes will be added in a later phase.

## Prerequisites

- **Node.js 20.9+** (check with `node -v`)
- **npm** (ships with Node)

## Setup

```bash
cd frontend
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Script          | Description                                             |
| --------------- | ------------------------------------------------------- |
| `npm run dev`   | Start the local development server on port 3000         |
| `npm run build` | Create an optimized production build                    |
| `npm run start` | Serve the production build (run `npm run build` first)  |
| `npm run lint`  | Run ESLint across the project                           |

## Project Structure

```
frontend/
├── public/              # Static assets served at the site root
├── src/
│   └── app/             # App Router routes, layouts, and styles
│       ├── globals.css  # Global styles + Tailwind import
│       ├── layout.tsx   # Root layout (fonts, metadata, <html>/<body>)
│       └── page.tsx     # Home route ("/")
├── eslint.config.mjs    # ESLint flat config
├── next.config.ts       # Next.js configuration
├── postcss.config.mjs   # PostCSS config (loads the Tailwind plugin)
└── tsconfig.json        # TypeScript config (includes the "@/*" import alias)
```

The import alias `@/*` maps to `src/*`, so `@/app/...` resolves from `src/app/...`.

## Tailwind CSS (v4)

This project uses **Tailwind CSS v4**, which differs from v3:

- There is **no `tailwind.config.js`** — content sources are auto-detected.
- Tailwind is enabled via `@import "tailwindcss";` at the top of
  `src/app/globals.css` (no `@tailwind base/components/utilities` directives).
- The PostCSS plugin lives in `postcss.config.mjs` as `@tailwindcss/postcss`.
- Theme tokens are declared with the `@theme` directive inside CSS.

This is expected — do **not** downgrade to v3 or add a JS config file.

## Deployment

**Not deployed yet.** The planned target is **AWS S3 + CloudFront**.
