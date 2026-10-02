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
       envVars:
         - key: NODE_ENV
           value: production
         - key: CORS_ORIGINS
           sync: false
   ```

2. On first deploy, run the seed command once so the demo data exists:
   `npm run seed` (in `backend/`), or in Render's Shell:
   `cd backend && npm run seed`.
3. Copy the backend public URL, e.g. `https://kims-queue-backend.onrender.com`.

## Option B — Railway / Fly.io / DigitalOcean / any Node host

Any host that runs `node server.js` + keeps a persistent volume for
`backend/data/queue.db` works. Railway, Fly.io (free tiers) and a small VPS are
all fine. The repo ships a `backend/Dockerfile` ready to use.

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

## Database note

`backend/data/queue.db` (SQLite) is git-ignored on purpose. On your host, keep
`backend/data/` on a persistent volume so review/queue data survives restarts,
and run `npm run seed` (demo data) + `npm run seed:reviews` (optional 100 reviews)
once on the deployed host.

## Verify

- Backend health: `GET <API_URL>/health` → `{ "ok": true, ... }`
- Frontend: `https://yuv9799.github.io/queue-manage/` loads real data.