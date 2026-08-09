# Empress of Japan — Frontend

Next.js visitor experience for the Vancouver Maritime Museum capstone. The app
lets visitors explore the Empress of Japan scenes, move between narrator routes,
chat with persona agents, and use browser/AWS-backed voice interaction.

## Prerequisites

- Node.js 20.9+
- npm
- A running backend API for local chat and voice testing

## Setup

```bash
cd frontend
npm install
```

Create `frontend/.env.local` for local development:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001
```

Then start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If the backend is running
on a different port, update `NEXT_PUBLIC_API_BASE_URL`.

## What is currently wired

- Next.js App Router shell with per-narrator scene routes
- React Three Fiber scene experience with panorama/ship exploration
- Narrator overlay for persona chat and scene-aware responses
- Source/uncertainty display for grounded backend answers
- Voice input through the browser flow and backend Transcribe endpoint
- Voice output through backend Polly synthesis with browser fallback behavior

The browser reads `NEXT_PUBLIC_API_BASE_URL` at build time and sends chat,
retrieval-adjacent UI requests, and voice requests to the backend CloudFront API.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the local development server |
| `npm run build` | Create an optimized production build |
| `npm run start` | Serve the production build after `npm run build` |
| `npm run lint` | Run ESLint across the frontend |

## Project Structure

```text
frontend/
├── public/              # Static assets, panoramas, icons, and original photos
├── src/
│   ├── app/             # App Router routes, layouts, and styles
│   ├── components/      # Scene, narrator, voice, and UI components
│   └── lib/             # API client, scene data, chat/session helpers
├── eslint.config.mjs
├── next.config.ts
├── postcss.config.mjs
└── tsconfig.json
```

The import alias `@/*` maps to `src/*`.

## Tailwind CSS

This project uses Tailwind CSS v4:

- There is no `tailwind.config.js`; content sources are auto-detected.
- Tailwind is enabled via `@import "tailwindcss";` in `src/app/globals.css`.
- The PostCSS plugin is configured in `postcss.config.mjs`.
- Theme tokens live in CSS through `@theme`.

## Deployment

The production frontend is deployed to AWS S3 behind CloudFront:

- Live frontend: https://d2kekuy8p1ofvv.cloudfront.net
- Backend API base URL is injected during the frontend deploy workflow from the
  Terraform-managed SSM parameter `/empress/backend/public_api_base_url`.

Deployments should go through the GitHub Actions frontend deploy workflow on
`main`; do not manually edit the S3 bucket contents.
