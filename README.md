# KhoAn — Self-Storage Facility Management (WDP301)

npm-workspaces monorepo:

| Folder | What | Status |
|---|---|---|
| `shared/` | `@ssm/shared` — enums, entity interfaces, state machines (used by every app) | ✅ |
| `Webapp/` | Next.js 15 + Tailwind v4 — mock UI for all 5 roles, in-memory data | ✅ Step 1 |
| `BE/` | Express 5 + Mongoose (Atlas) + Firebase Auth API — see `BE/README.md` | ✅ Step 2 |
| `Mobile/React-Native/` | Expo Router app (customer + on-site staff) | ⏳ Step 3 |

## Run the web mock

```bash
# from the repo root (installs every workspace and links @ssm/shared)
npm install
npm run web          # = npm run dev --workspace Webapp → http://localhost:3000
```

## Run the API
```bash
# fill BE/.env first (copy BE/.env.example) — Atlas URI + Firebase service account
npm run seed         # ⚠ wipes the configured DB and loads demo data + Firebase demo logins
npm run api          # http://localhost:4000/api
```

Requires Node 20+.
