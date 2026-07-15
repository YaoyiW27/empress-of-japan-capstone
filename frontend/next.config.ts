import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: this app is a pure client (talks to the backend via
  // NEXT_PUBLIC_API_BASE_URL; no route handlers, server actions, or
  // middleware), so `next build` emits a fully static `out/` we host on
  // S3 + CloudFront. See docs/architecture.md §2/§7 and infra/terraform/frontend.tf.
  output: "export",

  // Directory-style routes (`/explore/` -> `explore/index.html`) so every
  // prerendered page is a plain S3 object; a CloudFront viewer function appends
  // `index.html` for clean deep links (see infra/terraform/frontend.tf).
  trailingSlash: true,

  // No image-optimization server exists in a static export. All frontend imagery
  // (panoramas, portraits, poster) is already web-sized, so serve it as-authored.
  images: {
    unoptimized: true,
  },

  // Pin the workspace root to this app so Turbopack doesn't infer it from a
  // stray lockfile elsewhere on the machine (this is a monorepo).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
