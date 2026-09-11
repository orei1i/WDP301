# Webapp

Next.js (App Router) + Tailwind v4, backed by the real API in `BE/` and Firebase Auth (email/password + Google).

## Setup
1. BE running with seeded data (`npm run seed`, `npm run api` from the repo root — see `BE/README.md`).
2. Firebase console → *Project settings → General → Your apps → Add app → Web* → copy the SDK config.
3. `cp Webapp/.env.local.example Webapp/.env.local` and fill:
   - `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api`)
   - `NEXT_PUBLIC_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID / APP_ID`
   - optional `NEXT_PUBLIC_DEMO_PASSWORD` (= `SEED_PASSWORD` in BE) → one-click demo logins on `/login`
4. From the repo root: `npm install` then `npm run web` → http://localhost:3000

`localhost` is an authorised domain in Firebase by default; add your deployed domain under *Authentication → Settings → Authorized domains*.

## How data flows
- `lib/firebase.ts` — Firebase web SDK; sign-in / sign-up / Google popup / password reset / email verification.
- `lib/api.ts` — `fetch` wrapper that attaches the Firebase ID token and maps `{ error: { code, message } }` to `ApiError`.
- `lib/actions.ts` — one function per UI action → one REST call.
- `lib/store.tsx` — on sign-in: `POST /auth/sync` then `GET /bootstrap` (a snapshot already filtered by role and facility on the server).
  `run(action, payload, successText?, onOk?)` calls the API, then re-fetches the snapshot. Pages read `db` exactly as before.
- Public pages (`/`, `/facilities`, `/facilities/[id]`) use `GET /facilities/public…` — availability and quotes are computed by the server.
- `lib/domain.ts` only derives read-only numbers for dashboards (occupancy, revenue, refund preview). Every rule is enforced by BE.

`lib/mock-data.ts` is no longer used by the Webapp at runtime; `BE/src/scripts/seed.ts` imports it so the database starts with the same demo data.

## Test flows
See the 13 flows in the earlier checklist — they now run against the API. New ones:
- **Sign up** (email) → verification email → banner “Tôi đã xác minh” → can book.
- **Google** → first login creates a CUSTOMER profile automatically.
- **Admin creates staff** → reset link is copied to the clipboard → staff sets a password → signs in scoped to the assigned branch.
- **Role change** by admin → the affected user's next request gets `TOKEN_REVOKED` and is signed out.
