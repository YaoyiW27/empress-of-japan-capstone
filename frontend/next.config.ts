import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app so Turbopack doesn't infer it from a
  // stray lockfile elsewhere on the machine (this is a monorepo).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
