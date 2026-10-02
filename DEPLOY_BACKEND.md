# Deploying the Backend (required for the GitHub Pages site to work)

## Why this is needed

The frontend is deployed to **GitHub Pages**, which is **static hosting** — it can
serve HTML/CSS/JS but **cannot run a Node/Express process**. The app's data (queues,
tokens, departments, reviews, auth) lives in the Express backend
(`backend/`, SQLite via Node's built-in `node:sqlite`).

For the live app to work you must:
1. Host the backend on a provider that can run Node.
2. Point the frontend build at it via `VITE_API_URL`.
3. Add your backend's domain to the backend CORS allowlist.

## Backend entrypoint & commands

- Entry point: `backend/server.js`
- Start: `npm start` (i.e. `node server.js`)
- Local dev: `npm run dev` (nodemon)
- Seed demo data: `npm run seed` (once, on the deployed host)
- Seed 100 demo reviews: `npm run seed:reviews`
- Tests: `npm test`

## Production environment variables

| Variable | Purpose | Default | Required in prod |
|---|---|---|---|
| `PORT` | HTTP port the server listens on (most hosts inject this) | `8080` | host-injected |
| `HOST` | Bind address. `0.0.0.0` = all interfaces | `0.0.0.0` | no |
| `NODE_ENV` | `production` disables the demo-OTP bypass | `development` | yes (`production`) |
| `DB_PATH` | Absolute path of the SQLite database file | `<repo>/backend/data/queue.db` | yes → persistent volume |
| `JWT_SECRET` | Secret used to sign auth JWTs (`openssl rand -base64 48`) | dev fallback | **yes** |
| `CORS_ORIGINS` | Extra comma-separated allowed origins (in addition to `https://yuv9799.github.io` + localhost) | — | no |
| `TRUST_PROXY` | `1` when behind an HTTPS reverse proxy | `0` | set `1` on Render/NGINX |

## Persistence (SQLite)

- The database file is `backend/data/queue.db` (`config/db.js`, overridable with `DB_PATH`).
- WAL mode is on; `migrate()` creates tables/columns idempotently at startup.
- **You must keep that directory/file on a persistent disk/volume** so data survives restarts, and seed once after the first boot. Never bake a `queue.db` into the image (excluded via `backend/.dockerignore`).

## Option A — Render (recommended, free tier)

1. Create the file `render.yaml` at the repo root (sample below), push it, then
   on [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint**
   → select `yuv9799/queue-manage`. Render builds the `backend/Dockerfile`.

   ```yaml
   services:
     - type: web
       name: kims-queue-backend
       runtime: docker
       dockerfilePath: backend/Dockerfile
       healthCheckPath: /health
       disk:
         name: sqlite-data
         mountPath: /app/data
         sizeGB: 1
       envVars:
         - key: NODE_ENV
           value: production
         - key: PORT
           value: 8080
         - key: TRUST_PROXY
           value: "1"
         - key: DB_PATH
           value: /app/data/queue.db
         - key: JWT_SECRET
           generateValue: true
         - key: CORS_ORIGINS
           sync: false
   ```

2. On first deploy, run the seed command once so the demo data exists:
   `npm run seed` (in `backend/`), or in Render's Shell:
   `cd backend && npm run seed`.
3. Copy the backend public URL, e.g. `https://kims-queue-backend.onrender.com`.

## Option B — Railway / Fly.io / DigitalOcean / any Node host

Any host that runs the command `node server.js` (or the included `Dockerfile`)
and keeps a **persistent volume at `backend/data/`** (or the `DB_PATH` you set)
works. Railway, Fly.io (free tiers) and a small VPS are all fine. Seed once after
the first boot and set the env vars from the table above.

## Socket.io (real-time) behind a reverse proxy

- The backend mounts Socket.io on the **same HTTP server** at the default path
  `/socket.io`, with CORS restricted to the allowlist (incl.
  `https://yuv9799.github.io`).
- The frontend connects to `<VITE_API_URL>` with `websocket` + `polling`
  transports (`frontend/src/services/socket.js`).
- When hosted behind a proxy (Render/NGINX/Cloudflare) ensure:
  - the proxy forwards the request **path**, and
  - the production build has **`TRUST_PROXY=1`** set so protocol/IP are correct.
- No separate Socket.io server/port is needed — it shares the Express server.

## Point the GitHub Pages frontend at the backend

The Pages workflow in `.github/workflows/deploy.yml` builds the frontend. Set the
`VITE_API_URL` build arg so the bundle calls your deployed API (NOT localhost).

Add a workflow-level environment variable (or a GitHub Action variable named
`VITE_API_URL`) and pass it in the build step:

```yaml
- name: Build frontend
  working-directory: frontend
  run: npm run build
  env:
    VITE_API_URL: ${{ vars.VITE_API_URL }}
```

Or simpler, add it to your Bash for the build step. Then rebuild/test locally with:

```bash
cd frontend
VITE_API_URL=https://your-backend-host npm run build
```

## CORS

The backend already allows `https://yuv9799.github.io` and the localhost dev
origins by default (`backend/config/cors.js`). If you host the frontend
elsewhere, add that origin via the backend `CORS_ORIGINS` env var (comma-separated).

Note: the browser `Origin` header is only the origin (scheme + host), e.g.
`https://yuv9799.github.io` — it never includes the `/queue-manage` path. The
allowlist above is correct as-is.

## Database note

`backend/data/queue.db` (SQLite) is git-ignored on purpose. On your host, keep
`backend/data/` on a persistent volume so review/queue data survives restarts,
and run `npm run seed` (demo data) + `npm run seed:reviews` (optional 100 reviews)
once on the deployed host.

## Verify

- Backend health: `GET <API_URL>/health` → `{ "ok": true, ... }`
- Frontend: `https://yuv9799.github.io/queue-manage/` loads real data.