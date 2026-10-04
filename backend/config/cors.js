// CORS policy for the KIMS queue backend.
//
// GitHub Pages frontend: https://yuv9799.github.io  (project site /queue-manage/)
// Local dev (Vite):      http://localhost:5173 / http://localhost:5174 (fallback port)
//
// The backend authenticates with Bearer tokens (Authorization header), not
// cookies, so `credentials` stays false but the origin is strictly allowlisted
// rather than wide-open `*`. Set CORS_ORIGINS in the backend env to add more.
const DEFAULT_ORIGINS = [
  'https://yuv9799.github.io', // production GitHub Pages frontend
  'http://localhost:3000',
];

function devOrigins() {
  const ports = Array.from({ length: 100 }, (_, i) => 5173 + i);
  const localhost = ports.map((port) => `http://localhost:${port}`);
  const loopback = ports.map((port) => `http://127.0.0.1:${port}`);
  return [...localhost, ...loopback];
}

export function corsOrigins() {
  const extra = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ORIGINS, ...devOrigins(), ...extra];
}

// Express cors() options. Reflects the exact origin only when it is allowlisted
// (so browsers can send the Authorization header); non-allowlisted origins get
// no CORS headers and are blocked by the browser.
export function corsOptions() {
  const origins = corsOrigins();
  return {
    origin(origin, callback) {
      // Allow requests with no Origin header (curl, same-origin, health checks).
      if (!origin) return callback(null, true);
      if (origins.includes(origin)) return callback(null, origin);
      return callback(null, false);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Type'],
    credentials: false,
    optionsSuccessStatus: 204,
  };
}