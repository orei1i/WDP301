# KhoAn — Self-Storage Facility Management (WDP301)

npm-workspaces monorepo:

| Folder | What | Status |
|---|---|---|
| `shared/` | `@ssm/shared` — enums, entity interfaces, state machines (used by every app) | ✅ |
| `Webapp/` | Next.js 15 + Tailwind v4 — mock UI for all 5 roles, in-memory data | ✅ Step 1 |
| `BE/` | Express 5 + Mongoose (Atlas) + Firebase Auth API — see `BE/README.md` | ✅ Step 2 |
| `Mobile/React-Native/` | Expo Router app (customer + on-site staff) | ⏳ Step 3 |

## Cấu trúc mã nguồn

Cả `BE/` và `Webapp/` đều chia theo **chức năng nghiệp vụ**: mỗi thư mục trong `features/` là một chức năng của
app, phần dùng chung nằm trong `shared/`.

```
BE/src/                            Webapp/src/
  routes.ts   bảng mount router      app/         route Next.js (chia theo vai trò)
  features/                          features/
    auth/         đăng nhập            auth/          đăng nhập, đặt/quên mật khẩu
    users/        tài khoản, RBAC      facilities/    chi nhánh, ô kho, ước lượng cỡ
    facilities/   chi nhánh, ô kho     reservations/  QR giữ chỗ / check-in
    reservations/ giữ chỗ, check-in    payments/      chọn hình thức thanh toán
    contracts/    hợp đồng, bàn giao   tickets/       luồng trao đổi phiếu hỗ trợ
    payments/     giao dịch            legal/         điều khoản & bảo mật
    tickets/      phiếu hỗ trợ       shared/
    claims/       bồi thường           ui/            component dùng chung, biểu đồ
    policies/     chính sách & giá     layout/        app-shell, header, toast
    reports/      báo cáo              api/           client REST, Firebase, actions
    audit/        nhật ký              store/         store toàn cục
    bootstrap/    snapshot dashboard   lib/           format, labels, domain, nav, mock-data
    docs/         Swagger / OpenAPI
  shared/       config, core, db, http, utils
  jobs/ scripts/ types/
```

`Mobile/React-Native/` theo đúng quy ước đó. Expo Router bắt buộc file route nằm trong `app/`, nên `app/`
chỉ còn file một dòng trỏ về màn hình thật:

```
app/login.tsx            →  src/features/auth/login-screen.tsx
app/(tabs)/index.tsx     →  src/features/home/home-screen.tsx
app/(tabs)/account.tsx   →  src/features/account/account-screen.tsx
app/(tabs)/explore.tsx   →  src/features/facilities/explore-screen.tsx
app/(tabs)/support.tsx   →  src/features/tickets/support-screen.tsx
app/qr/[id].tsx          →  src/features/reservations/qr-screen.tsx
app/booking/[id].tsx     →  src/features/payments/booking-screen.tsx
app/contract/[id].tsx    →  src/features/contracts/contract-screen.tsx
src/shared/              ui/ (component + theme) · api/ (client, firebase, actions) · store/
```

`app/_layout.tsx` và `app/(tabs)/_layout.tsx` ở lại `app/` vì chúng là layout của router, không phải màn hình.

Thêm chức năng mới = thêm một thư mục trong `features/`, không rải file ra nhiều tầng `services/`, `models/`.
Chi tiết quy ước ở `BE/README.md` mục 7.

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
