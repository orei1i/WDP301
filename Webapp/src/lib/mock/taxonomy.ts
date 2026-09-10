import type { FoodType, ForumCategory, RecipeType } from "@/types";

export const FOOD_TYPES: FoodType[] = [
  { id: "ft_vegan", name: "Vegan", slug: "vegan", parentId: null },
  { id: "ft_raw", name: "Raw vegan", slug: "raw", parentId: "ft_vegan" },
  { id: "ft_wfpb", name: "Whole-food plant-based", slug: "wfpb", parentId: "ft_vegan" },
  { id: "ft_gf", name: "Gluten-free", slug: "gluten-free", parentId: null },
  { id: "ft_nf", name: "Nut-free", slug: "nut-free", parentId: null },
  { id: "ft_hp", name: "High-protein", slug: "high-protein", parentId: null },
];

export const RECIPE_TYPES: RecipeType[] = [
  { id: "rt_breakfast", name: "Breakfast", slug: "breakfast" },
  { id: "rt_main", name: "Main", slug: "main" },
  { id: "rt_soup", name: "Soups & stews", slug: "soup" },
  { id: "rt_salad", name: "Salads & bowls", slug: "salad" },
  { id: "rt_dessert", name: "Desserts", slug: "dessert" },
  { id: "rt_snack", name: "Snacks", slug: "snack" },
];

export const FORUM_CATEGORIES: { value: ForumCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "recipes", label: "Recipes & Cooking" },
  { value: "nutrition", label: "Health & Nutrition" },
  { value: "restaurants", label: "Restaurants" },
  { value: "travel", label: "Vegan Travel" },
  { value: "newbies", label: "New to Vegan" },
];

export const TRENDING_TAGS = [
  "tofu",
  "meal-prep",
  "pho-chay",
  "b12",
  "tempeh",
  "budget",
  "air-fryer",
  "iron",
  "banh-mi",
  "oat-milk",
];
