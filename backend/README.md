# KIMS Queue Management System — Backend

Express + Socket.io + `node:sqlite` (built-in SQLite, zero native deps).

## Setup

```bash
cd backend
npm install
npm run seed     # create KIMS sample data + demo users
npm run dev      # start server on http://localhost:8080
```

## Demo users (seeded)

| Role      | Email                 | Password      |
|-----------|-----------------------|---------------|
| Admin     | admin@kims.in         | admin123      |
| Officer   | officer@kims.in       | officer123    |
| Reception | reception@kims.in     | reception123  |

## Tests

```bash
npm test
```

## REST API

### Auth
- `POST /auth/login` `{ email, password }` → `{ token, user }`
- `POST /auth/register` (admin) `{ name, email, password, role }`
- `GET /auth/me` (auth)
- `GET /auth/users` (admin)

### Departments / Areas / Counters (write = admin, read = auth)
- `GET/POST /departments`, `PUT/DELETE /departments/:id`
- `GET/POST /areas`, `PUT/DELETE /areas/:id`
- `GET/POST /counters`, `PUT/DELETE /counters/:id`

### Tokens
- `POST /tokens` `{ departmentId, areaId, patientName? }` → issues token (public kiosk)
- `GET /tokens/live` → per-area snapshot `{ serving, queue, held }` (public TV board)
- `GET /tokens?status=&areaId=&departmentId=` (auth)
- `GET /tokens/:id` → token + queue position (public status lookup)
- `POST /tokens/:id/call` (officer/admin)
- `POST /tokens/:id/next` (officer/admin) — calls next queued in that area
- `POST /tokens/:id/skip` `POST /tokens/:id/hold` `POST /tokens/:id/complete` (officer/admin)
- `POST /tokens/:id/cancel` (officer/admin/reception)

### Stats (auth)
- `GET /stats/overview`, `GET /stats/status`, `GET /stats/hourly`
- `GET /stats/queue-depth`, `GET /stats/by-department`

### Reviews
- `GET /reviews` (public) — approved reviews; filters `type`, `rating`, `category`, `departmentId`, `q` (search), `sort` (`newest|oldest|highest|lowest`), `limit`
- `GET /reviews/summary` (public) — counts, average, patient/staff + rating breakdown, demo count
- `GET /reviews/analytics` (admin/officer) — aggregates + top improvement requests (by category) + category distribution
- `POST /reviews` (public, optional auth) — submit `{ reviewerName?, reviewerType, rating, comment, departmentId?, category? }`
- `GET /reviews/admin` (admin/officer) — moderation list; filters `status`/`type`/`departmentId`/`rating`/`category`/`isDemo`/`q`, `sort`
- `PATCH /reviews/:id/status` (admin/officer) — `{ status: APPROVED|REJECTED|PENDING }`
- `DELETE /reviews/:id` (admin) — remove a review

Review statuses: `PENDING → APPROVED | REJECTED`. Reviewer types: `PATIENT | STAFF`.

### Demo reviews
100 synthetic sample reviews are seeded via:
```bash
npm run seed:reviews
```
They are all flagged `is_demo = 1` (a `Demo` badge is shown in the UI). The seeder is idempotent: it only ever deletes/recreates `is_demo = 1` rows, so **genuine (is_demo=0) reviews are never overwritten**. Each demo review carries a `category` (feedback theme) and an optional `request` (requested improvement) for analytics.

## Token lifecycle

```
issued → queued → called → completed
                     ├─→ skipped
                     ├─→ held → called
                     └─→ cancelled
```

## Socket.io events
- `token:updated` `{ token }` — fired on any token change
- `queue:updated` `{ areaId }` — fired when a queue changes
- Client → server: `subscribe:area`, `unsubscribe:area`, `subscribe:all`