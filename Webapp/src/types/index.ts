// ─── Core domain types (mock-first; shape mirrors future MongoDB documents) ───

export type ID = string;
export type ISODate = string;

// ── Users & roles ────────────────────────────────────────────────────────────
export type Permission =
  | "content:create"
  | "content:edit:own"
  | "content:delete"
  | "content:moderate"
  | "comments:moderate"
  | "users:manage"
  | "roles:manage"
  | "categories:manage"
  | "ai:unlimited";

export interface UserRole {
  id: ID;
  name: string; // "Admin" | "User" | custom
  slug: "admin" | "user" | (string & {});
  description?: string;
  permissions: Permission[];
  isSystem: boolean; // system roles cannot be deleted
  color: "emerald" | "amber" | "stone" | "sky" | "rose";
}

export interface User {
  id: ID;
  name: string;
  handle: string;
  avatarUrl?: string;
  role: UserRole["slug"];
  location?: string;
  joinedAt: ISODate;
  stats?: { recipes: number; posts: number; followers: number };
}

/** Lightweight author reference embedded in content. */
export type AuthorRef = Pick<User, "id" | "name" | "handle" | "avatarUrl"> & {
  isVerified?: boolean;
};

// ── Taxonomy ─────────────────────────────────────────────────────────────────
export interface FoodType {
  id: ID;
  name: string; // "Vegan", "Raw", "Gluten-free"...
  slug: string;
  parentId?: ID | null;
}

export interface RecipeType {
  id: ID;
  name: string; // "Breakfast", "Main", "Dessert"...
  slug: string;
  parentId?: ID | null;
}

// ── Recipes ──────────────────────────────────────────────────────────────────
export type Difficulty = "easy" | "medium" | "hard";

export interface Ingredient {
  id: ID;
  name: string;
  quantity: number | null;
  unit?: string; // "g", "tbsp", "cup"
  note?: string; // "finely chopped"
  group?: string; // "For the sauce"
  optional?: boolean;
}

export interface RecipeStep {
  order: number;
  title?: string;
  body: string;
  timestampSec?: number; // jump point in the video
  durationMin?: number; // active time for this step
  tip?: string;
  imageUrl?: string;
}

export interface NutritionFacts {
  calories: number; // kcal per serving
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
}

export interface Recipe {
  id: ID;
  slug: string;
  title: string;
  description: string;
  coverUrl: string;
  videoUrl?: string;
  videoDurationSec?: number;
  author: AuthorRef;
  foodTypes: FoodType["slug"][];
  recipeType: RecipeType["slug"];
  cuisine?: string;
  difficulty: Difficulty;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  nutrition?: NutritionFacts;
  rating: number; // 0–5
  ratingCount: number;
  likes: number;
  views: number;
  isFeatured?: boolean;
  status: "published" | "pending" | "hidden";
  createdAt: ISODate;
}

// ── Forum ────────────────────────────────────────────────────────────────────
export type ForumCategory =
  | "general"
  | "recipes"
  | "nutrition"
  | "travel"
  | "restaurants"
  | "newbies";

export interface ForumPost {
  id: ID;
  slug: string;
  title: string;
  excerpt: string;
  category: ForumCategory;
  tags: string[];
  author: AuthorRef;
  location?: string;
  replies: number;
  views: number;
  upvotes: number;
  isPinned?: boolean;
  isHot?: boolean;
  isSolved?: boolean;
  lastReply?: { author: AuthorRef; at: ISODate };
  participants?: AuthorRef[];
  createdAt: ISODate;
  status: "published" | "flagged" | "hidden";
}

// ── Venues ───────────────────────────────────────────────────────────────────
export type VenueKind = "restaurant" | "shop" | "cafe" | "market";
export type VeganLevel = "vegan" | "vegetarian" | "veg-friendly";

export interface Restaurant {
  id: ID;
  slug: string;
  name: string;
  kind: VenueKind;
  veganLevel: VeganLevel;
  coverUrl: string;
  address: string;
  city: string;
  coords: { lat: number; lng: number };
  distanceKm?: number;
  rating: number;
  reviewCount: number;
  priceLevel: 1 | 2 | 3 | 4;
  tags: string[];
  isOpenNow?: boolean;
  openingHours?: string;
  /** Ingredient names this venue stocks (for "where to buy" matching). */
  carries?: string[];
}

// ── Meal planning ────────────────────────────────────────────────────────────
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type MealSlot = "breakfast" | "lunch" | "dinner";

export interface PlannedMeal {
  recipeId: ID | null;
  customTitle?: string;
  calories?: number;
}

export interface MealPlan {
  id: ID;
  userId: ID;
  weekStart: ISODate; // Monday
  targetCalories: number;
  bmi?: { heightCm: number; weightKg: number; value: number };
  days: Record<Weekday, Record<MealSlot, PlannedMeal>>;
  pantry: string[]; // for ingredient-matching pills
}

// ── Session (mock) ───────────────────────────────────────────────────────────
export type SessionRole = "guest" | "user" | "admin";

export interface Session {
  role: SessionRole;
  user: User | null;
  aiQuota: { used: number; limit: number };
}
