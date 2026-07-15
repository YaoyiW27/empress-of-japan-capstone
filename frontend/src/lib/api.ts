/**
 * Single source of truth for where the browser talks to the backend.
 *
 * `NEXT_PUBLIC_API_BASE_URL` is inlined at build time (see the deploy-frontend
 * workflow, which sets it to the backend CloudFront HTTPS URL). Locally it falls
 * back to the dev API. The value must be an absolute `http(s)://` origin with no
 * trailing slash.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

/**
 * WebSocket origin derived from the HTTP(S) API base: `https://` -> `wss://`,
 * `http://` -> `ws://`. Use this for WebSocket clients (e.g. a future browser
 * client for the backend's `WS /voice/transcribe` streaming endpoint) so the
 * scheme always tracks the API base — no separate env var to keep in sync.
 */
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");
