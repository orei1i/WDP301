# BE — Self-Storage API

Express 5 · Mongoose 8 (MongoDB Atlas) · Firebase Auth (email/password + Google) · Zod · shared types from `@ssm/shared`.

## 1. One-time setup

**MongoDB Atlas**
1. Create a cluster (M0 is fine — it is a replica set, so transactions work).
2. *Database Access* → add a user with *Read and write to any database*.
3. *Network Access* → add your IP (or `0.0.0.0/0` temporarily for dev).
4. *Connect → Drivers* → copy the `mongodb+srv://…` URI; put a database name before `?`, e.g. `/selfstorage?`.

**Firebase**
1. Create a project → *Authentication* → *Sign-in method* → enable **Email/Password** and **Google**.
2. *Project settings → Service accounts → Generate new private key* → take `project_id`, `client_email`, `private_key` from the JSON.
3. *Project settings → General → Your apps → Web app* → the web config is for Webapp/Mobile (step 3), not for BE.

**Env**
```bash
cp .env.example .env     # then fill MONGODB_URI + FIREBASE_*
```
> The service-account key is full admin access to your Firebase project. Keep it only in `BE/.env` (git-ignored). Never commit it or paste it anywhere.

## 2. Run
From the repo root (`WDP301/`):
```bash
npm install          # links @ssm/shared into BE
npm run seed         # ⚠ wipes the configured DB, loads the same demo data as the Webapp mock, creates Firebase demo logins
npm run api          # http://localhost:4000/api  (tsx watch)
```
Node ≥ 20.12 required (`process.loadEnvFile`).

API docs (all generated from the running code, no hand-written spec):

| URL | What |
|---|---|
| <http://localhost:4000/api/docs> | **Swagger UI** — has *Try it out*. Click **Authorize** → paste a Firebase ID token into `bearerAuth`, or in dev use `devUser` with an email (needs `AUTH_DEV_BYPASS=true`). |
| <http://localhost:4000/api/openapi.json> | OpenAPI 3.0.3 spec, rebuilt on every request. Import into Postman/Insomnia/codegen. |
| <http://localhost:4000/api> | Compact Vietnamese reference page (searchable, no JS framework). |
| <http://localhost:4000/api/docs.json> | Same page's data as plain JSON. |
| <http://localhost:4000/health> | Liveness + Mongo connection state. |

**How the spec stays in sync.** `src/modules/openapi.ts` walks the routers listed in `src/modules/registry.ts`
and reads what the route handlers were tagged with:

- paths + methods ← `router.stack` (`layer.route.path`)
- path/query/body params, required fields, types, enums, min/max ← the **zod schemas you already pass to `validate()`** (tagged via `SCHEMAS_TAG`)
- allowed roles ← the list you already pass to `authorize()` (tagged via `ROLES_TAG`)
- auth required? ← reference comparison against `authenticate` / `verifyFirebase`

So adding an endpoint or changing a zod schema updates Swagger on the next page load — nothing to keep in step by hand.
Only the prose descriptions come from the `API_GROUPS` table in `src/modules/docs.routes.ts`; a route missing from
that table still shows up in Swagger, just without a description.

Demo logins created by the seed (password = `SEED_PASSWORD`, default `Demo@12345`):

| Role | Email |
|---|---|
| CUSTOMER | khach.demo@khoan.dev |
| STAFF (Quận 7) | nhanvien.q7@khoan.dev |
| FACILITY_MANAGER (Quận 7) | quanly.q7@khoan.dev |
| FACILITY_MANAGER (Thủ Đức + Tân Bình) | quanly.td@khoan.dev |
| OPS_MANAGER | vanhanh@khoan.dev |
| ADMIN | admin@khoan.dev |

## 3. Auth flow
```
client ── Firebase signIn (email/password | Google) ──> idToken
client ── POST /api/auth/sync  (Bearer idToken) ──> creates CUSTOMER profile or links a pre-created one (verified email)
client ── any /api/*  (Bearer idToken)
BE     ── verifyIdToken(token, checkRevoked) → User by firebaseUid → role + facilityIds from Mongo → authorize → scope
```
- Role/scope live in Mongo only. Admin changes to role, branches or status call `revokeRefreshTokens`, so old tokens stop working at once.
- Staff accounts are created by ADMIN (`POST /api/users`), which creates the Firebase user and returns a password-reset link.

**Testing without a client (dev only):** set `AUTH_DEV_BYPASS=true` and send `x-dev-user: <email>` instead of a token.
```bash
curl -H "x-dev-user: quanly.q7@khoan.dev" http://localhost:4000/api/reservations?status=CONFIRMED
```

## 4. Endpoints (`/api`)
This table is prose only. The authoritative, always-current list is `GET /api/docs` (Swagger) / `GET /api/openapi.json`, generated from the route code itself.

| Method & path | Roles | Notes |
|---|---|---|
| `POST /auth/sync` · `GET /auth/me` | any signed-in | profile link / current user |
| `GET /bootstrap` | any signed-in | one scoped snapshot for the web dashboard (own data / branch data / chain data by role) |
| `GET /facilities/public` · `GET /facilities/public/:id?start=&months=` | public | `{ items, unitTypes }` catalogue with live availability · detail with quotes |
| `GET /facilities` · `POST /facilities` · `PATCH /facilities/:id` | read: staff+ · write: OPS, ADMIN | scoped list for STAFF/FM |
| `GET /facilities/:id/unit-types` · `PATCH /facilities/unit-types/:id/price` | · OPS | price control |
| `GET /units?facilityId=` · `POST /units` · `PATCH /units/:id/status` | STAFF, FM, OPS · FM · STAFF, FM | manual status only AVAILABLE↔MAINTENANCE |
| `GET /reservations` · `GET /reservations/:id` | all (customers see own, staff see branch) | |
| `POST /reservations` | CUSTOMER | txn + `inventoryVersion` bump; `Idempotency-Key` header supported |
| `POST /reservations/:id/pay-deposit` | CUSTOMER | mock gateway → CONFIRMED, returns `qrPayload` |
| `POST /reservations/:id/cancel` | owner / FM | refund per policy snapshot |
| `POST /reservations/:id/allocate` · `/unallocate` | FM | CAS on unit + partial unique index |
| `GET /reservations/lookup?code=` | STAFF, FM | accepts code or `SSM:<code>:<token>` QR payload |
| `POST /reservations/:id/check-in` | STAFF, FM | creates contract + first rent; returns PIN once |
| `GET /contracts` · `GET /contracts/:id` | all (scoped) | |
| `POST /contracts/:id/extend` | CUSTOMER | |
| `POST /contracts/:id/pay-balance` | CUSTOMER, STAFF, FM | lifts DELINQUENT/LOCKED_OUT |
| `POST /contracts/:id/lockout` · `/waive-late-fees` | FM · FM, OPS | waiver limited by policy |
| `POST /contracts/:id/move-out` · `/receive` · `/inspection` | owner/STAFF/FM · STAFF, FM · STAFF, FM | inspection settles deposit and closes contract |
| `GET /inspections?facilityId=` · `GET /payments` | scoped | |
| `GET/POST /tickets` · `POST /tickets/:id/assign|status|messages` | all (scoped) · FM · all | internal notes hidden from customers |
| `GET /policies` · `GET /policies/effective/:facilityId` · `POST /policies` | OPS/ADMIN/FM · any · OPS | publish = new immutable version |
| `GET/POST/PATCH /users` | ADMIN | Firebase user + revoke on privilege change |
| `GET /audit` | ADMIN | append-only |
| `GET /reports/summary?facilityId=&months=` | FM (own), OPS, ADMIN | occupancy, revenue by month, receivables aging |

Errors: `{ "error": { "code", "message", "details" } }`. Codes include `SOLD_OUT`, `UNIT_NOT_AVAILABLE`, `INVALID_STATE_TRANSITION`, `FACILITY_SCOPE`, `OWNERSHIP`, `HOLD_EXPIRED`, `WAIVER_LIMIT`, `TOKEN_REVOKED`.

## 5. Background jobs (in-process)
- every minute: expire unpaid holds → `CANCELLED(HOLD_EXPIRED)`
- hourly: issue due rent, mark `DELINQUENT` after the grace period (late fee), auto `LOCKED_OUT` after `lockoutAfterDays`

Run one API instance, or move `src/jobs` to a single worker before scaling out.

## 6. Structure
```
src/
  config/       env (zod), firebase-admin
  core/         errors, request context (AsyncLocalStorage)
  db/           connection, schema-kit, plugins (soft delete, append-only, actor stamps), models/
  domain/       dates, pricing/quote, availability, state transition helper
  middlewares/  context, authenticate (Firebase), authorize (roles), scope (facility/ownership), validate (zod)
  services/     reservation, contract, ticket, policy, user, inventory, report, audit, txn, payments
  modules/      *.routes.ts (thin HTTP layer)
  jobs/         hold expiry, billing & delinquency
  scripts/      seed, sync-indexes
```
