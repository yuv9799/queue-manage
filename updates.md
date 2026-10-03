# KIMS Queue Management System — Development Updates

## Project Fix Log

This file tracks verified changes made to the KIMS Queue Management System.

### Workflow

* Investigate one issue at a time.
* Make only the change required for that issue.
* Test the change before committing.
* Document the issue, root cause, resolution, files changed, and verification here.
* Create a separate Git commit for each completed fix.
* Only original GitHub repository files and updates.md are allowed to be committed/pushed.
* Do not track .claude/, .agents/, skills-lock.json, screenshots, logs, temporary reports, or other local tooling files.
* Do not push until all planned fixes and the final end-to-end audit are complete.

---

## Baseline Audit

### Initial Local Audit

The initial local audit identified problems involving:

* React Router base-path handling
* Authentication/OTP endpoint usage
* Staff phone-number formatting
* Authentication route mounting
* Local environment configuration
* Review API consistency
* Assignment API/dead-code verification
* Frontend production bundle size
* End-to-end browser functionality

No permanent application fixes from that local audit were kept in main.

---

## Upstream Changes Reviewed — October 3, 2026

After the initial audit, upstream GitHub changes were pulled and reviewed.

### 10adfe2 — Fix GitHub Pages SPA refresh 404

Upstream added dynamic React Router basename handling using Vite's BASE_URL and added the 404.html SPA fallback.

This supersedes our discarded local routing commit 3d8d939.

Status:
✅ Upstream already addressed the routing/base-path issue.

### ced565d — Restore backend/API integration

Upstream added/updated:

* CORS configuration
* environment-driven frontend API base
* production API configuration handling
* backend environment template
* backend deployment artifacts

It also uses the correct OTP endpoints:

* /auth/otp/request
* /auth/otp/verify

Status:
✅ Upstream addressed the previously identified wrong OTP endpoint issue.
✅ Upstream addressed the missing backend environment template/integration configuration.

### ca9aa9b — Fix blank GitHub Pages screen

Upstream added a non-null noop Socket.io implementation so frontend components do not crash when the backend/live socket is unavailable.

Status:
✅ Upstream addressed the previously identified Socket.io null-object crash.

### 5dee272 — Harden backend for public production deployment

Upstream added production hardening including:

* 0.0.0.0 binding
* Socket.io timing/options
* trust proxy configuration
* persistent SQLite deployment setup
* Docker-related improvements
* deployment environment documentation

Status:
✅ Upstream hardening changes are present.

---

## Current Post-Sync Issue Status

IMPORTANT:
Do not label an issue as definitively broken unless it has been confirmed through source inspection or runtime testing.

### Confirmed / Requires Follow-Up

#### A2 — Staff Phone Number Normalization

The seeded Admin account uses:

+91 9000000001

The authentication lookup appears to use an exact phone match.

The frontend and backend may not normalize equivalent formats consistently, for example:

+91 9000000001
vs
+919000000001

Status:
⚠️ REQUIRES RUNTIME VERIFICATION

Do not claim this is fixed or definitively broken until the correct OTP endpoint is tested in the browser/API.

#### S1 — Authentication Route Mounting

The current backend code contains multiple authentication-related routers mounted under /auth.

This creates potential route overlap/shadowing and must be verified.

Status:
⚠️ REQUIRES VERIFICATION

Do not modify it until the actual route behavior is tested.

#### ENV1 — NODE_ENV

Local environment configuration previously showed NODE_ENV=production.

Status:
⚠️ REQUIRES LOCAL ENVIRONMENT VERIFICATION

#### ENV2 — PORT

The local environment previously showed a PORT mismatch.

Status:
⚠️ REQUIRES LOCAL ENVIRONMENT VERIFICATION

#### Review PUT/PATCH

Status:
⚠️ NOT YET VERIFIED

#### assignments/redistribute-preview — ✅ FIXED

**Issue:** `POST /assignments/redistribute-preview` was missing from the backend. The route handler was not wired, so clients received 404.

**Root cause:** `Queue.redistributePreview(doctorId)` existed in `backend/models/Queue.js` (model layer), but no HTTP route was added in `backend/routes/assignments.js`.

**Resolution:** Added route wrapper at `POST /assignments/redistribute-preview` with:
- Input validation: `doctorId` required, must be numeric → 400 on failure
- 409 for nonexistent doctor (delegated from model)
- PHI sanitization: strips `currentToken` and `nextPatients` patient names from the `doctor` response object; `affected` tokens mapped to only `{id, token_number, patient_name}`
- Uses existing `requireAuth` + `requireRole('officer', 'admin', 'reception')` guard (same pattern as other assignment routes)

**Files changed:**
- `backend/routes/assignments.js` — added route handler
- `backend/tests/queue.test.js` — added 6 targeted tests

**Verification:**
- `node --test tests/queue.test.js` → 15/15 pass
- curl against running backend: happy path 200, missing doctorId 400, non-numeric 400, nonexistent 409, unauthenticated 401 ✅

**Status:** ✅ FIXED (2026-10-03)

#### Frontend Bundle Size

Status:
⚠️ NOT YET VERIFIED

#### End-to-End Browser Flows

The following still require complete browser verification:

* Patient token generation
* Token status
* Staff login
* Staff console
* Admin dashboard
* Live board
* Socket.io live updates
* Reviews
* Analytics
* Navigation
* Authentication/authorization

Status:
⚠️ NOT YET VERIFIED

---

## Fix History

No new application fixes have been made after synchronizing with upstream.

### Bug 3 — Public TokenKiosk doctor lookup uses protected /doctors endpoint

**Issue:** TokenKiosk on the public Home page called `api.doctors({ departmentId, active: true })` without any auth token → 401 → the doctor dropdown silently stayed empty. The public `/doctors/public` endpoint existed for exactly this purpose but was never wired into the frontend.

**Root Cause:** Public component used the auth-protected `/doctors` endpoint. Additionally, `/doctors/public` returned full `withWorkload()` data, which includes `currentToken.patient_name` and `nextPatients[].patient_name` — a patient-privacy leak on a public route.

**Resolution:**
- Added `doctorsPublic(params)` method to `frontend/src/services/api.js` calling `GET /doctors/public` (no token).
- Switched `TokenKiosk.jsx` from `api.doctors(...)` to `api.doctorsPublic({ departmentId })`.
- Sanitized `/doctors/public` in `backend/routes/doctors.js`: strips `currentToken` and `nextPatients` from each doctor before responding, eliminating patient-name exposure while preserving doctor name, specialization, status, and waiting counts.
- The authenticated `/doctors` endpoint (used by StaffConsole) is unchanged and still returns full workload data for staff.

**Files Changed:**
- `backend/routes/doctors.js` — patient-name sanitization added to `/doctors/public` route
- `frontend/src/services/api.js` — `doctorsPublic()` method added
- `frontend/src/components/TokenKiosk.jsx` — call switched to `doctorsPublic`
- `backend/tests/queue.test.js` — 4 targeted tests added
- `backend/tests/api.test.js` — updated `protected route requires auth` test which asserted `/stats/overview` returns 401; that behavior was intentionally changed to public access in Bug 2, so the test was updated to expect 200

**Verification:**
- `node --test` → 41/41 pass (35 pre-existing + 4 new doctor tests + 1 api.test.js + 1 stats)
- curl unauthenticated `GET /doctors/public` → 200, sanitized (no `patient_name`, no `currentToken`, no `nextPatients`)
- curl unauthenticated `GET /doctors` → 401 (auth boundary preserved)
- authenticated `GET /doctors` → 200 with full workload data (staff flow unaffected)

**Status:** FIXED (2026-10-03)

---

## Bug #4 — CORS departments failure on localhost:5174

**Date:** 2026-10-03

**Issue:** Frontend requests to `/departments` (and all other public endpoints) from `http://localhost:5174` were blocked at the browser CORS preflight. The backend `DEFAULT_ORIGINS` list in `config/cors.js` only included `localhost:5173`, missing `localhost:5174` — Vite's fallback port when 5173 is busy.

**Root Cause:** `config/cors.js:9-14` — `DEFAULT_ORIGINS` had `http://localhost:5173` and `http://127.0.0.1:5173` but no 5174 entries. The `GET /departments` route itself is public (no auth middleware). The failure was purely at the CORS preflight — the browser blocked the request before it reached Express.

**Resolution:** Added two entries to `DEFAULT_ORIGINS` in `backend/config/cors.js`:
- `http://localhost:5174` — Vite dev server fallback port
- `http://127.0.0.1:5174` — same, as 127.0.0.1

Matching the existing 5173 pair. No other changes needed — `corsOptions()` is applied globally and Socket.io also calls `corsOrigins()`.

**Files Changed:**
- `backend/config/cors.js` — `http://localhost:5174` and `http://127.0.0.1:5174` added to `DEFAULT_ORIGINS`; comment updated
- `backend/tests/queue.test.js` — 3 targeted CORS tests added

**Verification:**
- `node --test tests/queue.test.js` → 24/24 pass
- `node --test tests/api.test.js` → 0 failures
- `node --test tests/reviews.test.js` → 0 failures
- `corsOrigins()` returns `['https://yuv9799.github.io','http://localhost:5173','http://127.0.0.1:5173','http://localhost:5174','http://127.0.0.1:5174']` (plus any `CORS_ORIGINS` env extras)

**Status:** FIXED (2026-10-03)

---

## Bug #5 — SEC-F1: Hardcoded JWT Secret Fallback

**Date:** 2026-10-03

**Issue:** `backend/middleware/auth.js:4` hardcoded a fallback for `JWT_SECRET`:
```js
export const JWT_SECRET = process.env.JWT_SECRET || 'kims-queue-dev-secret-change-me';
```
Any deployment missing the `JWT_SECRET` environment variable silently used this public-known string, producing cryptographically weak tokens that are trivial to forge.

**Root Cause:** The hardcoded fallback bypasses the fail-safe expectation that required secrets must be explicitly provided. There was no guard to reject deployments running with the weak default.

**Resolution:** Replaced line 4 in `backend/middleware/auth.js` with an explicit fail-fast guard:
```js
const secret = process.env.JWT_SECRET || '';
if (secret.length < 32) {
  throw new Error('JWT_SECRET must be set to a long random value (openssl rand -base64 48)');
}
export const JWT_SECRET = secret;
```
If `JWT_SECRET` is absent or shorter than 32 characters, the module throws immediately at load time with a clear message. The existing test suite (api.test.js, queue.test.js, reviews.test.js) sets `process.env.JWT_SECRET` before importing `app.js`, so they are unaffected.

**Files Changed:**
- `backend/middleware/auth.js` — hardcoded fallback replaced with fail-fast guard
- `backend/tests/api.test.js` — `process.env.JWT_SECRET` set before importing `app.js`
- `backend/tests/queue.test.js` — `process.env.JWT_SECRET` set before importing `app.js`
- `backend/tests/reviews.test.js` — `process.env.JWT_SECRET` set before importing `app.js`
- `backend/tests/auth.test.js` — new file: 3 targeted tests for the fail-fast guard (missing env, short value, valid value)

**Verification:**
- `node --test` → all pass (requires `JWT_SECRET` env var set)
- Subprocess tests in `auth.test.js` verify throw-on-missing and throw-on-short behavior
- The 3 existing test suites (api, queue, reviews) pass with the new guard in place

**Status:** FIXED (2026-10-03)

---

## Next Fix

The next fix must be based on a verified remaining issue.
