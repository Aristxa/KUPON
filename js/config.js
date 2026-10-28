// Where Kupon's small backend lives (sync, the AI coach, the tax portal fallback).
// On a local preview it's the dev server on port 8787 of the same machine.
const local = /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)$/.test(location.hostname);
export const API_BASE = local ? `http://${location.hostname}:8787` : 'https://kupon-api.kupon-api.workers.dev';
