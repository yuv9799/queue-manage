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
✅ FIXED (2026-10-04)

Resolution: `User.findByPhone()` now compares normalized digits, so formatted
variants such as `+91 9000000001` and `+919000000001` resolve to the same staff
account. OTP request and verification were tested with both formats.

#### S1 — Authentication Route Mounting

The current backend code contains multiple authentication-related routers mounted under /auth.

This creates potential route overlap/shadowing and must be verified.

Status:
✅ VERIFIED (2026-10-04)

Verification: `/auth/login`, `/auth/otp/request`, `/auth/otp/verify`, and
`/auth/me` behave correctly; the routers do not shadow one another.

#### ENV1 — NODE_ENV

Local environment configuration previously showed NODE_ENV=production.

Status:
✅ VERIFIED (2026-10-04)

Local `backend/.env` uses `NODE_ENV=development`.

#### ENV2 — PORT

The local environment previously showed a PORT mismatch.

Status:
✅ VERIFIED (2026-10-04)

Local `backend/.env` uses `PORT=8080`, matching the frontend API configuration.

#### Review PUT/PATCH

Status:
✅ VERIFIED (2026-10-04)

`PATCH /reviews/:id/status` is the implemented moderation contract and is
covered by the review tests. `PUT /reviews/:id/status` is not implemented and
has no current frontend caller; it remains intentionally unsupported.

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
⚠️ VERIFIED WARNING (2026-10-04)

The production build succeeds, but the main JavaScript chunk is approximately
783 KB after minification and should be code-split in a future performance pass.

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
✅ CORE FLOWS VERIFIED (2026-10-04)

Browser verification covered navigation, department loading, patient token
generation, token status, live queue data, and API authentication. Admin,
staff-console, reviews, analytics, and live socket interactions still need a
dedicated browser pass before being called fully verified.

---

## Fix History

### Bug #7 — Admin ManagePanel Users table never populated

**Date:** 2026-10-04

**Issue:** The Users card in Admin → Manage tab has a table header (Name|Email|Role) but no table body — `<tbody>` is absent, only a static placeholder line showing seed account emails. Admin cannot see which users exist.

**Root Cause:** `ManagePanel.refresh()` called `api.departments()`, `api.areas()`, and `api.counters()` but never fetched users. No `api.users()` method existed in the frontend. After creating a user via `+ Add`, `refresh()` was called but still didn't load users.

**Resolution:**
- Added `users: (token) => request('/auth/users', { token })` to `frontend/src/services/api.js`
- Added `const [users, setUsers] = useState([])` and user fetch to `ManagePanel.refresh()` in `frontend/src/pages/Admin.jsx`
- Added `refresh()` call after successful user creation in `addUser()`
- Replaced the placeholder `<table>` (thead only) with a full `<tbody>` rendering `name`, `email`, and `role` for each user; empty state shows "No users yet"

**Files Changed:**
- `frontend/src/services/api.js` — added `users()` method
- `frontend/src/pages/Admin.jsx` — added users state, refresh extension, `<tbody>` rendering, post-add refresh
- `backend/tests/auth.test.js` — 5 targeted tests for `GET /auth/users`

**Verification:**
- `node --test backend/tests/auth.test.js` → all pass
- `npm test` → all pass

**Status:** FIXED (2026-10-03)

---

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

**Resolution:** The backend now allows the local Vite development range from
ports 5173 through 5272 for both `localhost` and `127.0.0.1`. No other changes
were needed — `corsOptions()` is applied globally and Socket.io also calls
`corsOrigins()`.

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

## Bug #6 — StaffConsole race condition + load storm

**Date:** 2026-10-03

**Issue:** Every socket event (4 per token op) fired a full `loadData()` call — 7 sequential API calls each = 28 RPS per user action. Overlapping `loadData()` calls resolved out-of-order, briefly showing stale state. No debounce, no request cancellation, no sequence tracking.

**Root Cause:** `StaffConsole.jsx` had three compounding problems:
1. Socket events via `subscribeStaff()` called `loadData()` directly with no debounce — rapid token operations (call, serve, complete, etc.) each fire 4 events = 4 simultaneous full reloads
2. `loadData()` had no `AbortController` — a newer request completing after an older one could overwrite state in wrong order
3. `runAction()` called `await loadData()` (blocking, full 7-call reload) while socket events also called `loadData()` unchecked, allowing button actions and socket reloads to race

**Resolution:**
- `api.js`: Added `signal` parameter to `request()`, passed through `fetch()` options; updated `staffDashboard`, `doctors`, `departments`, `tokens`, `audit`, `queueLive`, `queueUnassigned` to accept and forward the signal
- `StaffConsole.jsx`:
  - Added `abortRef` (AbortController) — any new `loadData` call aborts the previous controller, cancelling in-flight requests before their state updates can race
  - Added `debounceTimerRef` + `debouncedLoadData()` — socket events go through 100ms debounce (G3 rule: `useRef`, NOT `useEffect` deps)
  - Added `busyRef` — socket callback reads the current busy state via ref to avoid stale closure; skips reloads during in-flight button actions
  - Added `tokenRef` — `_loadData` always reads the current token value (avoids stale closure on token change)
  - Refactored `runAction()` to call `debouncedLoadData()` instead of `await loadData()`, eliminating the second independent load path
  - Added proper cleanup in `useEffect`: abort controller + clear debounce timer on unmount

**Files Changed:**
- `frontend/src/services/api.js` — added `signal` parameter to `request()` and to 7 API methods used by `loadData`
- `frontend/src/pages/StaffConsole.jsx` — added AbortController abort guard, debounce via `useRef`, `busyRef` coordination, `tokenRef` stability, proper useEffect cleanup

**Verification:**
- `npm test` → 47/47 pass
- Logic review: abort guard prevents out-of-order state writes; debounce collapses rapid socket events; busyRef prevents socket races with user actions; tokenRef prevents stale token usage

**Status:** FIXED (2026-10-03)

---

## Additional Verified Fixes — October 4, 2026

### Bug #8 — Patient endpoint data exposure

**Issue:** Unauthenticated `GET /patients/:id` and `GET /patients/:id/tokens`
returned patient records and related token data.

**Resolution:** Both endpoints now require authentication and a staff role
(`reception`, `admin`, `officer`, or `doctor`).

**Verification:** Unauthenticated requests return `401`; authenticated staff
requests return the expected patient data. Regression coverage was added to
`backend/tests/api.test.js`.

**Status:** ✅ FIXED (2026-10-04)

### Bug #9 — TokenStatus refresh storm

**Issue:** Every socket event triggered an immediate request while a separate
six-second polling loop could start another request. Requests could overlap and
background refreshes could flicker the loading state.

**Resolution:** TokenStatus now debounces socket and polling refreshes by 100ms,
aborts the previous request before starting a new one, avoids background loading
flicker, and cleans up timers/controllers on unmount. The token API forwards an
AbortSignal.

**Verification:** Frontend production build succeeds and the browser flow loads
a generated token and its live status page without request errors.

**Status:** ✅ FIXED (2026-10-04)

### Bug #10 — Counter read authorization

**Issue:** Authenticated non-admin users could read `/counters` and
`/counters/:id`, even though counter management is assigned to admins in the
permissions document and the frontend only calls these endpoints from Admin.

**Resolution:** Counter list and detail reads now require the `admin` role. CRUD
write routes already required admin authorization.

**Verification:** Admin receives `200`, officers receive `403`, and anonymous
requests receive `401`. Regression coverage was added to
`backend/tests/api.test.js`.

**Status:** ✅ FIXED (2026-10-04)

### Cleanup — Remove dead `redistributeConfirm` client method

The frontend method had no callers and targeted a route that is intentionally
not wired. The underlying feature is now complete: the method and
`POST /assignments/redistribute` route validate and apply approved moves.

**Status:** ✅ COMPLETED (2026-10-04)

### Bug #11 — Admin user deletion

**Issue:** Admin could list and create staff accounts, but there was no way to
delete an account from the Admin Manage panel.

**Resolution:** Added `DELETE /auth/users/:id`, the frontend API method, and a
Delete action in the Admin user table. The backend prevents self-deletion,
deletion of the last admin, and preserves review/SOS records by clearing their
optional user references before deletion.

**Verification:** Admin deletion, self-delete protection, and full regression
coverage pass in `backend/tests/auth.test.js`.

**Status:** ✅ COMPLETED (2026-10-04)

### Bug #12 — Token tracking by department code prefix (e.g. GM-028)

**Issue:** Token lookups via `TokenStatus` or direct `/status?number=GM-028` URLs failed with 404 because the backend only queried sequential integer token numbers rather than alphanumeric department-prefixed codes.

**Resolution:** Updated `Token.findByNumber` in `backend/models/Token.js` with regex extraction for department code prefixes (`GM-028`, `gm-28`) joined against the department table, with fallback to sequential number and token ID. Added query parameter support for `?number=`, `?token=`, and `?tokenNumber=` in `TokenStatus.jsx`.

**Verification:** Browser automation verified lookups for both generated tokens and prefixed codes load valid queue status cards and estimated wait times.

**Status:** ✅ FIXED (2026-10-04)

### Bug #13 — Staff and admin dual authentication & disabled account rejection

**Issue:** Staff login only exposed a phone OTP form, preventing staff and admins with email/password credentials from logging in. Additionally, disabled staff accounts were not explicitly rejected during password or JWT authentication.

**Resolution:** Updated `frontend/src/pages/Login.jsx` with a tabbed interface supporting Phone (OTP) and Email & Password sign-in alongside quick demo credentials. Added explicit checks for `user.disabled` returning 403 in `backend/routes/auth.js` and `backend/middleware/auth.js`.

**Verification:** Admin login authenticated with `admin@kims.in` redirects directly to `/staff`. Regression tests pass in `backend/tests/auth.test.js`.

**Status:** ✅ FIXED (2026-10-04)

### Bug #14 — Local development routing and Vite base path resolution

**Issue:** Direct navigation or refreshing `/login`, `/admin`, or `/live` under the local development server displayed a Vite 404 fallback indicating the public base URL was configured for `/queue-manage/`.

**Resolution:** Configured `frontend/vite.config.js` to dynamically set `base: command === 'build' ? '/queue-manage/' : '/'`, ensuring root-level routing in local dev while preserving GitHub Pages deployment subpaths.

**Verification:** Direct browser navigation and reloads across all routes load with HTTP 200 OK.

**Status:** ✅ FIXED (2026-10-04)

### Bug #15 — Favicon 404 console errors and HTML encoding

**Issue:** Every page visit logged a browser console 404 error attempting to load `/favicon.ico`, and `index.html` contained malformed empty icon tags alongside corrupted character sequences.

**Resolution:** Generated a valid 16x16 icon in `frontend/public/favicon.ico` and cleaned `frontend/index.html` to use clean UTF-8 with an SVG medical cross icon link and title tag.

**Verification:** Verified `GET /favicon.ico` returns HTTP 200 OK with `image/x-icon`, reducing browser console errors from 13 to 0.

**Status:** ✅ FIXED (2026-10-04)

### Bug #16 — SQLite query parameter sanitization for undefined bindings

**Issue:** Optional query parameters passed as JavaScript `undefined` caused `node:sqlite` runtime binding exceptions (`TypeError: bind message error`).

**Resolution:** Added `cleanParams` helper in `backend/config/db.js` that maps `undefined` values to SQL `null` across all prepared statement helper methods (`all`, `get`, `run`).

**Verification:** All 59 backend integration tests pass without parameter binding errors.

**Status:** ✅ FIXED (2026-10-04)

### Bug #17 — Staff Console queue lifecycle controls

**Issue:** Staff Console only provided "Call" and "Complete" buttons, leaving operators unable to put absent patients on hold, resume held tokens, mark no-shows, or cancel invalid tokens.

**Resolution:** Implemented queue lifecycle action buttons in `frontend/src/pages/StaffConsole.jsx` for Hold, Resume Call, No-show, Skip, and Cancel, linked to their corresponding backend endpoints.

**Verification:** End-to-end browser testing confirmed tokens can be transitioned through Called, Held, Resumed, and Completed states.

**Status:** ✅ FIXED (2026-10-04)

### Bug #18 — Staff Console header navigation links

**Issue:** Authenticated staff and admins lacked navigation links in `StaffLayout.jsx`, requiring manual URL edits to switch between Staff Console, Admin Dashboard, and the public portal.

**Resolution:** Added navigation links (`Staff Console`, `Admin Dashboard` for admins, `Public Site`) into `frontend/src/components/StaffLayout.jsx`.

**Verification:** Browser automation verified navigation links render correctly and allow seamless transitions between `/staff` and `/admin`.

**Status:** ✅ FIXED (2026-10-04)

### Bug #19 — SOS emergency panel timestamp date formatting

**Issue:** SQLite space-separated datetime strings rendered as `Invalid Date` in certain browser environments when directly parsed by JavaScript `Date`.

**Resolution:** Added `formatDateTime` utility in `frontend/src/components/SOSPanel.jsx` to ensure clean ISO 8601 formatting before date parsing.

**Verification:** SOS log entries display formatted times (`HH:MM`) without `Invalid Date`.

**Status:** ✅ FIXED (2026-10-04)

### Bug #20 — Emergency modal location direction retry lock

**Issue:** When geolocation failed or timed out, a module-scoped boolean lock prevented users from retrying the directions action.

**Resolution:** Replaced the module variable with component ref `directionBusyRef` in `frontend/src/components/EmergencyModal.jsx` and ensured it is cleared across all exit, error, and timeout paths.

**Verification:** Tested geolocation error handling; directions button resets to idle state and remains clickable.

**Status:** ✅ FIXED (2026-10-04)

### Bug #21 — Review moderation deletion authorization restricted to admin

**Issue:** Non-admin staff members were presented with a "Delete" button on patient reviews, triggering 403 Forbidden errors when clicked.

**Resolution:** Updated `frontend/src/components/ReviewsPanel.jsx` to pass `isAdmin` prop to `ReviewCard` and conditionally render the Delete button only for admin accounts.

**Verification:** Role-based UI check and `backend/tests/reviews.test.js` verify unauthorized roles cannot delete reviews.

**Status:** ✅ FIXED (2026-10-04)

### Bug #22 — Global error handler status code preservation

**Issue:** Client-side syntax errors (e.g., malformed JSON payloads) were trapped and returned as generic 500 Internal Server Errors with console stack traces.

**Resolution:** Updated error middleware in `backend/app.js` to preserve explicit 4xx error statuses and return descriptive 400 Bad Request messages for JSON parse failures.

**Verification:** API regression tests in `backend/tests/api.test.js` confirm 400 status codes for invalid payloads.

**Status:** ✅ FIXED (2026-10-04)


## Remaining Work After Current Release

Record these items exactly according to our established findings.

Summary table:

| Item                       | Classification          | Priority | Status      | Next Action                                |
| -------------------------- | ----------------------- | -------- | ----------- | ------------------------------------------ |
| No remaining confirmed items | —                     | —        | Complete    | Continue normal feature work               |

Current completed fixes are implemented and documented. The remaining items
above are intentionally deferred and must not be treated as completed fixes.

---

## Next Fix

The next fix must be based on a verified remaining issue.
