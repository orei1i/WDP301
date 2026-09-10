# VeggieHub — Web (UI-first)

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · lucide-react.
Mock data + local state only — no backend yet.

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
```

Use the **Preview as: Guest / User / Admin** switch at the bottom of the sidebar to see each role.

## Structure

```
src/
├─ app/
│  ├─ layout.tsx                 # root: fonts, globals, <SessionProvider>
│  ├─ globals.css                # Tailwind v4 @theme (fonts, animations)
│  ├─ (main)/                    # public + user shell (Navbar/Sidebar/MobileTabBar)
│  │  ├─ layout.tsx              # <AppShell>
│  │  ├─ page.tsx                # Screen 1 — Discovery feed  "/"
│  │  ├─ recipes/[slug]/         # Screen 2 — Video recipe detail (SSG from mock)
│  │  ├─ recipes/new/            # upload form (later)
│  │  ├─ forum/  nearby/  planner/  nutrition/  saved/
│  ├─ (auth)/  login/ register/  # full-page auth (?next= redirect); modal = AuthModal
│  └─ admin/                     # dark admin shell: moderation, roles/, categories/
├─ components/
│  ├─ ui/         # atoms: Button/ButtonLink, Badge, Card, Chip, Input, Avatar(+Stack), Modal, SectionHeader
│  ├─ layout/     # AppShell, Navbar, Sidebar, AuthHeader, MobileTabBar, Logo, ComingSoon
│  ├─ feed/       # FeaturedRecipe, RecipeFeed, RecipeVideoCard, ForumFeed, ForumThreadCard, feed-rail widgets
│  ├─ recipe/     # player-context, VideoPlayer+ChapterStrip, RecipeHeader, RecipeStats, RecipeBody,
│  │              # IngredientList, StepList, NutritionCard, ShopSuggestions, AuthorCard, RecipeReviews
│  ├─ ai/         # AiChatWidget (floating, guest quota 3), RichText
│  ├─ auth/       # AuthForm (login/register), AuthModal, AuthPage
│  └─ providers/  # Providers = Session → AuthModal → AiChat
├─ lib/
│  ├─ mock/       # users/roles, recipes, forum, taxonomy, notifications, restaurants, reviews, ai
│  ├─ navigation.ts  cn.ts  format.ts  hooks/
└─ types/index.ts # Recipe, ForumPost, Restaurant, UserRole, MealPlan, Session…
```

## Demo tips

- Guests get **3 free AI queries** (floating "Ask AI" button). The 4th opens the auth modal.
- Any email + 8-char password signs in; emails starting with `admin` sign in as Admin.
- Recipe detail: "Watch this step" jumps the stub player; the active step highlights while "playing".
